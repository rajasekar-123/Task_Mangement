import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { requireRole } from '../../middleware/auth';
import { parse } from '../../middleware/error';

const createBody = z.object({
  name: z.string().trim().min(1).max(150),
  contactEmail: z.string().trim().email().max(254).nullable().optional(),
});
const updateBody = createBody.partial().strict().refine((o) => Object.keys(o).length > 0, 'At least one field is required');
const id = z.string().uuid();

export const clientsRouter = Router();

// PMs need to read clients to attach projects to them; only admins can change them.
clientsRouter.get('/', requireRole('ADMIN', 'PROJECT_MANAGER'), async (_req, res) => {
  const data = await prisma.client.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { projects: true } } },
  });
  res.json({ data });
});

clientsRouter.post('/', requireRole('ADMIN'), async (req, res) => {
  res.status(201).json({ data: await prisma.client.create({ data: parse(createBody, req.body) }) });
});

clientsRouter.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const data = await prisma.client.update({ where: { id: parse(id, req.params.id) }, data: parse(updateBody, req.body) });
  res.json({ data });
});
