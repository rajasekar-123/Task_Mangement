import { FormEvent, useState } from 'react';
import type { Priority, TaskStatus } from '../api/types';
import type { TaskInput } from '../hooks/useMutations';
import { useAssignable } from '../hooks/useQueries';
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, toDateInput } from '../lib/format';
import { ErrorText } from './ui';

interface Props {
  initial?: Partial<TaskInput>;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (values: TaskInput) => void;
}

/** Used by admins and PMs for creating and editing tasks. (Developers only get the status dropdown.) */
export function TaskForm({ initial, submitLabel, pending, error, onSubmit }: Props) {
  const { data: developers = [] } = useAssignable();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [assigneeId, setAssigneeId] = useState(initial?.assigneeId ?? '');
  const [status, setStatus] = useState<TaskStatus>(initial?.status ?? 'TODO');
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 'MEDIUM');
  const [dueDate, setDueDate] = useState(toDateInput(initial?.dueDate ?? null));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      title,
      description,
      assigneeId: assigneeId || null,
      status,
      priority,
      dueDate: dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : null,
    });
  };

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
      </label>
      <label>
        Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={5000} />
      </label>
      <div className="form-row">
        <label>
          Assignee
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Unassigned</option>
            {developers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Due date
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      </div>
      <div className="form-row">
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorText error={error} />
      <button className="btn primary" disabled={pending}>
        {pending ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
