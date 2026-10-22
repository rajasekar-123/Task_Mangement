import { Router } from 'express';
import { z } from 'zod';
import { me, requireRole } from '../../middleware/auth';
import { parse } from '../../middleware/error';
import { createTaskBody, listTasksQuery, updateTaskBody } from './tasks.schemas';
import * as service from './tasks.service';

const taskId = z.coerce.number().int().positive();
const projectId = z.string().uuid();

export const tasksRouter = Router();

// All roles may call these; visibility is enforced by the scope helpers in the service.
tasksRouter.get('/tasks', async (req, res) => {
  res.json({ data: await service.listTasks(me(req), parse(listTasksQuery, req.query)) });
});

tasksRouter.get('/tasks/:id', async (req, res) => {
  res.json({ data: await service.getTask(me(req), parse(taskId, req.params.id)) });
});

tasksRouter.patch('/tasks/:id', async (req, res) => {
  const id = parse(taskId, req.params.id);
  res.json({ data: await service.updateTask(me(req), id, parse(updateTaskBody, req.body)) });
});

// Management actions: admin and PM only (developers get 403 at the middleware layer).
const manage = requireRole('ADMIN', 'PROJECT_MANAGER');

tasksRouter.post('/projects/:projectId/tasks', manage, async (req, res) => {
  const pid = parse(projectId, req.params.projectId);
  res.status(201).json({ data: await service.createTask(me(req), pid, parse(createTaskBody, req.body)) });
});

tasksRouter.delete('/tasks/:id', manage, async (req, res) => {
  await service.deleteTask(me(req), parse(taskId, req.params.id));
  res.status(204).end();
});
