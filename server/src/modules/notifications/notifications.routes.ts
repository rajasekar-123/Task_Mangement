import { Router } from 'express';
import { me } from '../../middleware/auth';
import * as service from './notifications.service';

export const notificationsRouter = Router();

notificationsRouter.get('/', async (req, res) => {
  res.json(await service.list(me(req).id));
});

// Declared before "/:id/read" so "read-all" is never captured as an id.
notificationsRouter.post('/read-all', async (req, res) => {
  await service.markAllRead(me(req).id);
  res.status(204).end();
});

notificationsRouter.post('/:id/read', async (req, res) => {
  await service.markRead(me(req).id, req.params.id);
  res.status(204).end();
});
