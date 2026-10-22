import { ActivityType, Prisma, TaskStatus } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { AuthUser } from '../../middleware/auth';
import { activityScope } from '../../lib/scope';

export const activityInclude = {
  actor: { select: { id: true, name: true } },
  task: { select: { id: true, title: true, assigneeId: true } },
  project: { select: { id: true, name: true, createdById: true } },
} satisfies Prisma.ActivityLogInclude;

export type ActivityRow = Prisma.ActivityLogGetPayload<{ include: typeof activityInclude }>;

export interface ActivityDTO {
  id: string;
  type: ActivityType;
  actor: { id: string; name: string } | null; // null = system
  taskId: number | null;
  taskTitle: string | null;
  projectId: string;
  projectName: string;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus | null;
  detail: string | null;
  createdAt: string;
}

export const toActivityDTO = (r: ActivityRow): ActivityDTO => ({
  id: r.id,
  type: r.type,
  actor: r.actor,
  taskId: r.taskId,
  taskTitle: r.task?.title ?? null,
  projectId: r.projectId,
  projectName: r.project.name,
  fromStatus: r.fromStatus,
  toStatus: r.toStatus,
  detail: r.detail,
  createdAt: r.createdAt.toISOString(),
});

/** Newest-first page of the role-scoped feed, read straight from the database (no in-memory cache). */
export async function listActivity(user: AuthUser, opts: { limit: number; before?: Date }) {
  const rows = await prisma.activityLog.findMany({
    where: { ...activityScope(user), ...(opts.before ? { createdAt: { lt: opts.before } } : {}) },
    include: activityInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: opts.limit,
  });
  return rows.map(toActivityDTO);
}
