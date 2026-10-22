import type { Activity, Priority, TaskStatus } from '../api/types';

export const STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
export const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  DONE: 'Done',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

export const ROLE_LABEL = { ADMIN: 'Admin', PROJECT_MANAGER: 'Project Manager', DEVELOPER: 'Developer' } as const;

export function timeAgo(iso: string, now = Date.now()): string {
  const secs = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** Structured activity → "Ravi moved Task #12 from In Progress → In Review" (without the relative time). */
export function activitySentence(a: Activity): { actor: string; text: string } {
  const actor = a.actor?.name.split(' ')[0] ?? 'System';
  const task = `Task #${a.taskId ?? '?'}`;
  switch (a.type) {
    case 'STATUS_CHANGED':
      return {
        actor,
        text: `moved ${task} from ${STATUS_LABEL[a.fromStatus!]} → ${STATUS_LABEL[a.toStatus!]}`,
      };
    case 'TASK_CREATED':
      return { actor, text: `created ${task}${a.detail ? ` and assigned it to ${a.detail}` : ''}` };
    case 'ASSIGNED':
      return { actor, text: a.detail === 'Unassigned' ? `unassigned ${task}` : `assigned ${task} to ${a.detail}` };
    case 'MARKED_OVERDUE':
      return { actor: 'System', text: `marked ${task} as Overdue` };
  }
}

/** Date input value (YYYY-MM-DD) <-> ISO. */
export const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
