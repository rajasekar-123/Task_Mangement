import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { projectScope } from '../../lib/scope';
import { me } from '../../middleware/auth';
import { parse } from '../../middleware/error';

const createBody = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(5000).default(''),
  clientId: z.string().uuid(),
});
const updateBody = createBody
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'At least one field is required');
const id = z.string().uuid();

const include = {
  client: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  _count: { select: { tasks: true } },
} satisfies Prisma.ProjectInclude;

// Mounted behind requireRole('ADMIN', 'PROJECT_MANAGER'); the scope helper additionally limits PMs to their own projects.
export const projectsRouter = Router();

projectsRouter.get('/', async (req, res) => {
  const data = await prisma.project.findMany({ where: projectScope(me(req)), include, orderBy: { createdAt: 'desc' } });
  res.json({ data });
});

projectsRouter.post('/', async (req, res) => {
  const body = parse(createBody, req.body);
  if (!(await prisma.client.findUnique({ where: { id: body.clientId }, select: { id: true } }))) {
    throw badRequest('clientId does not match an existing client');
  }
  const data = await prisma.project.create({ data: { ...body, createdById: me(req).id }, include });
  res.status(201).json({ data });
});

projectsRouter.get('/:id', async (req, res) => {
  const data = await prisma.project.findFirst({ where: { id: parse(id, req.params.id), ...projectScope(me(req)) }, include });
  if (!data) throw notFound('Project');
  res.json({ data });
});

projectsRouter.patch('/:id', async (req, res) => {
  const projectId = parse(id, req.params.id);
  const body = parse(updateBody, req.body);
  if (!(await prisma.project.findFirst({ where: { id: projectId, ...projectScope(me(req)) }, select: { id: true } }))) {
    throw notFound('Project');
  }
  if (body.clientId && !(await prisma.client.findUnique({ where: { id: body.clientId }, select: { id: true } }))) {
    throw badRequest('clientId does not match an existing client');
  }
  res.json({ data: await prisma.project.update({ where: { id: projectId }, data: body, include }) });
});

projectsRouter.delete('/:id', async (req, res) => {
  const projectId = parse(id, req.params.id);
  if (!(await prisma.project.findFirst({ where: { id: projectId, ...projectScope(me(req)) }, select: { id: true } }))) {
    throw notFound('Project');
  }
  await prisma.project.delete({ where: { id: projectId } });
  res.status(204).end();
});
