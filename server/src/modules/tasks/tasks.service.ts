import { Prisma, Priority, TaskStatus } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { AuthUser } from '../../middleware/auth';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { STATUS_LABEL } from '../../lib/labels';
import { projectScope, taskScope } from '../../lib/scope';
import { publishActivity, publishTaskRemoved, publishTaskUpdated } from '../../realtime/publisher';
import { ActivityRow, activityInclude, toActivityDTO } from '../activity/activity.service';
import { createNotification, deliver } from '../notifications/notifications.service';
import type { CreateTaskInput, ListTasksQuery, UpdateTaskInput } from './tasks.schemas';

export const taskInclude = {
  assignee: { select: { id: true, name: true } },
  project: { select: { id: true, name: true, createdById: true, client: { select: { name: true } } } },
} satisfies Prisma.TaskInclude;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export interface TaskDTO {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
  projectId: string;
  projectName: string;
  clientName: string;
  assignee: { id: string; name: string } | null;
}

export const toTaskDTO = (t: TaskRow): TaskDTO => ({
  id: t.id,
  title: t.title,
  description: t.description,
  status: t.status,
  priority: t.priority,
  dueDate: t.dueDate?.toISOString() ?? null,
  isOverdue: t.isOverdue,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
  projectId: t.project.id,
  projectName: t.project.name,
  clientName: t.project.client.name,
  assignee: t.assignee,
});

// Priority enum is declared LOW..CRITICAL, so DESC puts CRITICAL first.
export const taskOrder: Prisma.TaskOrderByWithRelationInput[] = [
  { priority: 'desc' },
  { dueDate: { sort: 'asc', nulls: 'last' } },
  { id: 'asc' },
];

const DAY = 24 * 60 * 60 * 1000;

function dueRange(from?: string, to?: string): Prisma.DateTimeNullableFilter | undefined {
  if (!from && !to) return undefined;
  const f: Prisma.DateTimeNullableFilter = {};
  if (from) f.gte = new Date(from);
  if (to) {
    const d = new Date(to);
    // A bare calendar date means "through the end of that day".
    f.lt = /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(d.getTime() + DAY) : new Date(d.getTime() + 1);
  }
  return f;
}

export async function listTasks(user: AuthUser, q: ListTasksQuery) {
  // A developer asking for someone else's tasks gets an empty list from taskScope, never other people's data.
  const where: Prisma.TaskWhereInput = {
    AND: [
      taskScope(user),
      {
        ...(q.status && { status: { in: q.status } }),
        ...(q.priority && { priority: { in: q.priority } }),
        ...(q.projectId && { projectId: q.projectId }),
        ...(q.assigneeId && { assigneeId: q.assigneeId }),
        ...(q.overdue && { isOverdue: q.overdue === 'true' }),
        ...(dueRange(q.dueFrom, q.dueTo) && { dueDate: dueRange(q.dueFrom, q.dueTo) }),
      },
    ],
  };
  const rows = await prisma.task.findMany({ where, include: taskInclude, orderBy: taskOrder, take: q.limit });
  return rows.map(toTaskDTO);
}

export async function getTask(user: AuthUser, id: number) {
  const task = await prisma.task.findFirst({ where: { id, ...taskScope(user) }, include: taskInclude });
  if (!task) throw notFound('Task');
  const history = await prisma.activityLog.findMany({
    where: { taskId: id },
    include: activityInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return { ...toTaskDTO(task), history: history.map(toActivityDTO) };
}

async function assertAssignable(tx: Prisma.TransactionClient, userId: string) {
  const dev = await tx.user.findFirst({ where: { id: userId, role: 'DEVELOPER', isActive: true }, select: { id: true } });
  if (!dev) throw badRequest('assigneeId must be an active developer');
}

export async function createTask(user: AuthUser, projectId: string, input: CreateTaskInput) {
  const project = await prisma.project.findFirst({ where: { id: projectId, ...projectScope(user) } });
  if (!project) throw notFound('Project');

  const { task, activity, notification } = await prisma.$transaction(async (tx) => {
    if (input.assigneeId) await assertAssignable(tx, input.assigneeId);
    const created = await tx.task.create({
      data: {
        projectId,
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        dueDate: input.dueDate ?? null,
        assigneeId: input.assigneeId ?? null,
        createdById: user.id,
      },
      include: taskInclude,
    });
    const act = await tx.activityLog.create({
      data: {
        taskId: created.id,
        projectId,
        actorId: user.id,
        type: 'TASK_CREATED',
        toStatus: created.status,
        detail: created.assignee?.name ?? null,
      },
      include: activityInclude,
    });
    const notif =
      created.assigneeId && created.assigneeId !== user.id
        ? await createNotification(tx, {
            userId: created.assigneeId,
            type: 'TASK_ASSIGNED',
            taskId: created.id,
            message: `${user.name} assigned you Task #${created.id}: ${created.title}`,
          })
        : null;
    return { task: created, activity: act, notification: notif };
  });

  publishTaskUpdated(toTaskDTO(task), project.createdById);
  publishActivity(activity);
  if (notification) await deliver(notification);
  return toTaskDTO(task);
}

export async function updateTask(user: AuthUser, id: number, input: UpdateTaskInput) {
  // Authorisation first, using the same scope as reads: out-of-scope tasks look nonexistent (404).
  const visible = await prisma.task.findFirst({ where: { id, ...taskScope(user) }, select: { id: true } });
  if (!visible) throw notFound('Task');
  if (user.role === 'DEVELOPER' && Object.keys(input).some((k) => k !== 'status')) {
    throw forbidden('Developers can only update the status of their assigned tasks');
  }

  const result = await prisma.$transaction(async (tx) => {
    // Row lock so concurrent status changes serialise and "from → to" in the log is always accurate.
    await tx.$queryRaw`SELECT id FROM "Task" WHERE id = ${id} FOR UPDATE`;
    const existing = await tx.task.findUniqueOrThrow({ where: { id }, include: taskInclude });

    if (input.assigneeId) await assertAssignable(tx, input.assigneeId);

    const newStatus = input.status ?? existing.status;
    const newDue = input.dueDate !== undefined ? input.dueDate : existing.dueDate;
    const statusChanged = newStatus !== existing.status;
    const assigneeChanged = input.assigneeId !== undefined && input.assigneeId !== existing.assigneeId;

    // Clear the overdue flag when it no longer applies; only the scheduled job ever sets it.
    const clearOverdue = existing.isOverdue && (newStatus === 'DONE' || !newDue || newDue.getTime() > Date.now());

    const updated = await tx.task.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.priority !== undefined && { priority: input.priority }),
        ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
        ...(input.assigneeId !== undefined && { assigneeId: input.assigneeId }),
        ...(input.status !== undefined && { status: input.status }),
        ...(clearOverdue && { isOverdue: false }),
      },
      include: taskInclude,
    });

    const activities: ActivityRow[] = [];
    const notifications = [];

    if (statusChanged) {
      activities.push(
        await tx.activityLog.create({
          data: {
            taskId: id,
            projectId: existing.projectId,
            actorId: user.id,
            type: 'STATUS_CHANGED',
            fromStatus: existing.status,
            toStatus: newStatus,
          },
          include: activityInclude,
        }),
      );
      const pmId = existing.project.createdById;
      if (newStatus === 'IN_REVIEW' && pmId !== user.id) {
        notifications.push(
          await createNotification(tx, {
            userId: pmId,
            type: 'TASK_IN_REVIEW',
            taskId: id,
            message: `${user.name} moved Task #${id} to ${STATUS_LABEL.IN_REVIEW}: ${existing.title}`,
          }),
        );
      }
    }

    if (assigneeChanged) {
      activities.push(
        await tx.activityLog.create({
          data: {
            taskId: id,
            projectId: existing.projectId,
            actorId: user.id,
            type: 'ASSIGNED',
            detail: updated.assignee?.name ?? 'Unassigned',
          },
          include: activityInclude,
        }),
      );
      if (updated.assigneeId && updated.assigneeId !== user.id) {
        notifications.push(
          await createNotification(tx, {
            userId: updated.assigneeId,
            type: 'TASK_ASSIGNED',
            taskId: id,
            message: `${user.name} assigned you Task #${id}: ${updated.title}`,
          }),
        );
      }
    }

    return { updated, activities, notifications, previousAssigneeId: existing.assigneeId };
  });

  // Fan out only after the transaction has committed.
  publishTaskUpdated(toTaskDTO(result.updated), result.updated.project.createdById, result.previousAssigneeId);
  result.activities.forEach(publishActivity);
  await Promise.all(result.notifications.map(deliver));
  return toTaskDTO(result.updated);
}

export async function deleteTask(user: AuthUser, id: number) {
  const task = await prisma.task.findFirst({
    where: { id, ...taskScope(user) },
    select: { id: true, assigneeId: true, project: { select: { createdById: true } } },
  });
  if (!task) throw notFound('Task');
  await prisma.task.delete({ where: { id } });
  publishTaskRemoved(id, task.project.createdById, task.assigneeId);
}
