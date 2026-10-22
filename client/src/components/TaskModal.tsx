import type { TaskStatus } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { useDeleteTask, useUpdateTask } from '../hooks/useMutations';
import { useTask } from '../hooks/useQueries';
import { useNow } from '../hooks/useNow';
import { STATUSES, STATUS_LABEL, activitySentence, formatDate, timeAgo } from '../lib/format';
import { TaskForm } from './TaskForm';
import { ErrorText, Loading, Modal, OverdueBadge, PriorityBadge, StatusBadge } from './ui';

export function TaskModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { user } = useAuth();
  const { data: task, isLoading, error } = useTask(id);
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const now = useNow();
  const canManage = user?.role !== 'DEVELOPER';

  return (
    <Modal title={`Task #${id}`} onClose={onClose} wide>
      {isLoading && <Loading />}
      {error && <ErrorText error={error} />}
      {task && (
        <div className="task-detail">
          <div className="task-main">
            {canManage ? (
              <TaskForm
                key={task.updatedAt}
                initial={task}
                submitLabel="Save changes"
                pending={update.isPending}
                error={update.error}
                onSubmit={(v) => update.mutate({ id, ...v })}
              />
            ) : (
              <>
                <h3>{task.title}</h3>
                <p className="muted">{task.description || 'No description.'}</p>
                <dl className="facts">
                  <dt>Project</dt>
                  <dd>
                    {task.projectName} · {task.clientName}
                  </dd>
                  <dt>Priority</dt>
                  <dd>
                    <PriorityBadge priority={task.priority} />
                  </dd>
                  <dt>Due</dt>
                  <dd>
                    {formatDate(task.dueDate)} {task.isOverdue && task.status !== 'DONE' && <OverdueBadge />}
                  </dd>
                  <dt>Status</dt>
                  <dd>
                    <select
                      className={`status-select status-${task.status}`}
                      value={task.status}
                      onChange={(e) => update.mutate({ id, status: e.target.value as TaskStatus })}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </dd>
                </dl>
                <ErrorText error={update.error} />
              </>
            )}
            {canManage && (
              <button
                className="btn danger"
                disabled={remove.isPending}
                onClick={() => window.confirm(`Delete Task #${id}? This also deletes its history.`) && remove.mutate(id, { onSuccess: onClose })}
              >
                Delete task
              </button>
            )}
          </div>

          <aside className="task-history">
            <h3>
              Activity log <StatusBadge status={task.status} />
            </h3>
            <ul className="history">
              {task.history.map((h) => {
                const s = activitySentence(h);
                return (
                  <li key={h.id}>
                    <strong>{s.actor}</strong> {s.text}
                    <div className="muted small" title={new Date(h.createdAt).toLocaleString()}>
                      {timeAgo(h.createdAt, now)}
                    </div>
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      )}
    </Modal>
  );
}
