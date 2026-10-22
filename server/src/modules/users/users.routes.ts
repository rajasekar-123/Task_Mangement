import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { me, requireRole } from '../../middleware/auth';
import { parse } from '../../middleware/error';
import { disconnectUser } from '../../realtime/socket';
import { revokeAllForUser } from '../auth/auth.service';

const select = { id: true, name: true, email: true, role: true, isActive: true, createdAt: true } as const;

const createBody = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(200),
  role: z.nativeEnum(Role),
});

const updateBody = z
  .object({
    name: z.string().trim().min(1).max(100),
    role: z.nativeEnum(Role),
    isActive: z.boolean(),
    password: z.string().min(8).max(200),
  })
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'At least one field is required');

const id = z.string().uuid();

export const usersRouter = Router();

// Anyone who can assign work (admin, PM) may list developers. Only id + name are exposed.
usersRouter.get('/assignable', requireRole('ADMIN', 'PROJECT_MANAGER'), async (_req, res) => {
  const data = await prisma.user.findMany({
    where: { role: 'DEVELOPER', isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  res.json({ data });
});

// Everything below is admin-only.
usersRouter.use(requireRole('ADMIN'));

usersRouter.get('/', async (_req, res) => {
  res.json({ data: await prisma.user.findMany({ select, orderBy: [{ role: 'asc' }, { name: 'asc' }] }) });
});

usersRouter.post('/', async (req, res) => {
  const body = parse(createBody, req.body);
  const user = await prisma.user.create({
    data: { name: body.name, email: body.email, role: body.role, passwordHash: await bcrypt.hash(body.password, 10) },
    select,
  });
  res.status(201).json({ data: user });
});

usersRouter.patch('/:id', async (req, res) => {
  const userId = parse(id, req.params.id);
  const body = parse(updateBody, req.body);
  const self = me(req);
  if (userId === self.id && (body.role !== undefined || body.isActive === false)) {
    throw badRequest('You cannot change your own role or deactivate yourself');
  }
  if (!(await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) throw notFound('User');

  const { password, ...rest } = body;
  const user = await prisma.user.update({
    where: { id: userId },
    data: { ...rest, ...(password && { passwordHash: await bcrypt.hash(password, 10) }) },
    select,
  });
  // Deactivation, role change or password reset invalidates existing sessions and live sockets.
  if (body.isActive === false || body.role !== undefined || password) {
    await revokeAllForUser(userId);
    disconnectUser(userId);
  }
  res.json({ data: user });
});
