import { Router } from 'express';
import { z } from 'zod';
import { me } from '../../middleware/auth';
import { parse } from '../../middleware/error';
import { listActivity } from './activity.service';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  before: z.coerce.date().optional(),
});

export const activityRouter = Router();

// GET /api/activity?limit=20&before=<ISO>  — role-scoped, DB-backed. Used for first load and reconnect catch-up.
activityRouter.get('/', async (req, res) => {
  const q = parse(querySchema, req.query);
  res.json({ data: await listActivity(me(req), q) });
});
