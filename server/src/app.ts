import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { authenticate, requireRole } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';
import { activityRouter } from './modules/activity/activity.routes';
import { authRouter } from './modules/auth/auth.routes';
import { clientsRouter } from './modules/clients/clients.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { projectsRouter } from './modules/projects/projects.routes';
import { tasksRouter } from './modules/tasks/tasks.routes';
import { usersRouter } from './modules/users/users.routes';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind Vercel / Render / nginx: correct client IP for rate limiting + secure cookies
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Public: login / refresh / logout. (/auth/me authenticates itself.)
  app.use('/api/auth', authRouter);

  // Everything below requires a valid access token. Role rules are declared here, at the mount point,
  // so the full access matrix is readable in one place. Row-level rules live in lib/scope.ts.
  const staff = requireRole('ADMIN', 'PROJECT_MANAGER');
  app.use('/api/users', authenticate, usersRouter); // admin-only inside, except GET /assignable (admin+PM)
  app.use('/api/clients', authenticate, clientsRouter); // read: admin+PM, write: admin
  app.use('/api/projects', authenticate, staff, projectsRouter); // admin + PM (PM limited to own)
  app.use('/api/dashboard', authenticate, dashboardRouter);
  app.use('/api/activity', authenticate, activityRouter);
  app.use('/api/notifications', authenticate, notificationsRouter);
  app.use('/api', authenticate, tasksRouter); // /tasks, /tasks/:id, /projects/:id/tasks

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
