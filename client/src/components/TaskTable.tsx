import type { Task, TaskStatus } from '../api/types';
import { useUpdateTask } from '../hooks/useMutations';
import { STATUSES, STATUS_LABEL, formatDate } from '../lib/format';
import { OverdueBadge, PriorityBadge } from './ui';

interface Props {
  tasks: Task[];
  onOpen: (id: number) => void;
  showAssignee?: boolean;
  showProject?: boolean;
}

export function TaskTable({ tasks, onOpen, showAssignee = true, showProject = true }: Props) {
  const update = useUpdateTask();

  if (tasks.length === 0) return <p className="empty">No tasks match.</p>;

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Task</th>
            {showProject && <th>Project</th>}
            {showAssignee && <th>Assignee</th>}
            <th>Priority</th>
            <th>Due</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} className={t.isOverdue && t.status !== 'DONE' ? 'row-overdue' : ''}>
              <td className="muted">{t.id}</td>
              <td>
                <button className="link-btn" onClick={() => onOpen(t.id)}>
                  {t.title}
                </button>
                {t.isOverdue && t.status !== 'DONE' && <OverdueBadge />}
              </td>
              {showProject && (
                <td>
                  {t.projectName}
                  <div className="muted small">{t.clientName}</div>
                </td>
              )}
              {showAssignee && <td>{t.assignee?.name ?? <span className="muted">Unassigned</span>}</td>}
              <td>
                <PriorityBadge priority={t.priority} />
              </td>
              <td>{formatDate(t.dueDate)}</td>
              <td>
                <select
                  className={`status-select status-${t.status}`}
                  value={t.status}
                  disabled={update.isPending && update.variables?.id === t.id}
                  aria-label={`Status of task ${t.id}`}
                  onChange={(e) => update.mutate({ id: t.id, status: e.target.value as TaskStatus })}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {update.isError && <p className="error-text">{(update.error as Error).message}</p>}
    </div>
  );
}
