import { ActivityRow, toActivityDTO } from '../modules/activity/activity.service';
import type { TaskDTO } from '../modules/tasks/tasks.service';
import { getIO, rooms } from './socket';

/**
 * Recipients are computed with the same rules as lib/scope.ts:
 *   admin      -> everything
 *   PM         -> activity/tasks of projects they created
 *   developer  -> activity/tasks assigned to them
 * We emit to per-user and per-role rooms rather than a shared "project" room, so a developer
 * viewing a project can never receive an event about another developer's task.
 * Socket.io de-duplicates a socket that is in several of the targeted rooms.
 */
const recipientRooms = (ownerId: string, assigneeId: string | null | undefined) => {
  const r = [rooms.role('ADMIN'), rooms.user(ownerId)];
  if (assigneeId) r.push(rooms.user(assigneeId));
  return r;
};

export function publishActivity(row: ActivityRow) {
  getIO()
    ?.to(recipientRooms(row.project.createdById, row.task?.assigneeId))
    .emit('activity:new', toActivityDTO(row));
}

export function publishTaskUpdated(task: TaskDTO, ownerId: string, previousAssigneeId?: string | null) {
  const io = getIO();
  if (!io) return;
  io.to(recipientRooms(ownerId, task.assignee?.id)).emit('task:updated', task);
  // Reassigned away: tell the old assignee to drop it, without sending them the task contents.
  if (previousAssigneeId && previousAssigneeId !== task.assignee?.id) {
    io.to(rooms.user(previousAssigneeId)).emit('task:removed', { id: task.id });
  }
}

export function publishTaskRemoved(taskId: number, ownerId: string, assigneeId: string | null) {
  getIO()?.to(recipientRooms(ownerId, assigneeId)).emit('task:removed', { id: taskId });
}
