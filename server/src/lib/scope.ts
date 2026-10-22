import { Prisma } from '@prisma/client';
import { AuthUser } from '../middleware/auth';

/**
 * The single source of truth for "what can this role see".
 * Every query that reads projects, tasks or activity goes through these.
 * Realtime recipients are derived from the same rules (see realtime/publisher.ts).
 */
export const projectScope = (u: AuthUser): Prisma.ProjectWhereInput => {
  switch (u.role) {
    case 'ADMIN':
      return {};
    case 'PROJECT_MANAGER':
      return { createdById: u.id };
    default:
      return { tasks: { some: { assigneeId: u.id } } };
  }
};

export const taskScope = (u: AuthUser): Prisma.TaskWhereInput => {
  switch (u.role) {
    case 'ADMIN':
      return {};
    case 'PROJECT_MANAGER':
      return { project: { createdById: u.id } };
    default:
      return { assigneeId: u.id };
  }
};

export const activityScope = (u: AuthUser): Prisma.ActivityLogWhereInput => {
  switch (u.role) {
    case 'ADMIN':
      return {};
    case 'PROJECT_MANAGER':
      return { project: { createdById: u.id } };
    default:
      return { task: { assigneeId: u.id } };
  }
};
