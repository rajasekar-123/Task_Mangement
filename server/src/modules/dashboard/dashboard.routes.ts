import { Router } from 'express';
import { me } from '../../middleware/auth';
import { dashboardFor } from './dashboard.service';

export const dashboardRouter = Router();

// Each role gets a differently shaped payload, built only from that role's scope.
dashboardRouter.get('/', async (req, res) => {
  res.json({ data: await dashboardFor(me(req)) });
});
