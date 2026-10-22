import { useSearchParams } from 'react-router-dom';
import type { Priority, TaskStatus } from '../api/types';
import { PRIORITIES, STATUSES } from '../lib/format';

const FILTER_KEYS = ['status', 'priority', 'dueFrom', 'dueTo', 'overdue'] as const;

const csv = <T extends string>(raw: string | null, allowed: readonly T[]): T[] =>
  (raw?.split(',') ?? []).filter((v): v is T => (allowed as readonly string[]).includes(v));

/**
 * Filters live in the URL query string, so any filtered view is a shareable link and survives reloads.
 * The same keys are forwarded verbatim to GET /api/tasks.
 */
export function useTaskFilters(extra: Record<string, string> = {}) {
  const [params, setParams] = useSearchParams();

  const status = csv<TaskStatus>(params.get('status'), STATUSES);
  const priority = csv<Priority>(params.get('priority'), PRIORITIES);
  const dueFrom = params.get('dueFrom') ?? '';
  const dueTo = params.get('dueTo') ?? '';
  const overdue = params.get('overdue') === 'true';

  const apiQuery = new URLSearchParams(extra);
  if (status.length) apiQuery.set('status', status.join(','));
  if (priority.length) apiQuery.set('priority', priority.join(','));
  if (dueFrom) apiQuery.set('dueFrom', dueFrom);
  if (dueTo) apiQuery.set('dueTo', dueTo);
  if (overdue) apiQuery.set('overdue', 'true');

  const update = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const toggle = <T extends string>(key: 'status' | 'priority', current: T[], value: T) => {
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    update(key, next.join(',') || null);
  };

  const clear = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        FILTER_KEYS.forEach((k) => next.delete(k));
        return next;
      },
      { replace: true },
    );

  const active = status.length + priority.length + (dueFrom ? 1 : 0) + (dueTo ? 1 : 0) + (overdue ? 1 : 0);

  return { status, priority, dueFrom, dueTo, overdue, active, apiQuery: apiQuery.toString(), update, toggle, clear };
}

/** ?task=12 opens the task modal and is shareable too. */
export function useOpenTask() {
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get('task'));
  const id = Number.isInteger(raw) && raw > 0 ? raw : null;
  const open = (taskId: number | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (taskId) next.set('task', String(taskId));
        else next.delete('task');
        return next;
      },
      { replace: false },
    );
  return { id, open };
}
