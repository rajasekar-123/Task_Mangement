import { useTaskFilters } from '../hooks/useTaskFilters';
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from '../lib/format';

export function TaskFilters({ filters }: { filters: ReturnType<typeof useTaskFilters> }) {
  const f = filters;
  return (
    <div className="filters">
      <div className="filter-group">
        <span className="filter-label">Status</span>
        {STATUSES.map((s) => (
          <button key={s} className={`chip${f.status.includes(s) ? ' on' : ''}`} onClick={() => f.toggle('status', f.status, s)}>
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      <div className="filter-group">
        <span className="filter-label">Priority</span>
        {PRIORITIES.map((p) => (
          <button key={p} className={`chip${f.priority.includes(p) ? ' on' : ''}`} onClick={() => f.toggle('priority', f.priority, p)}>
            {PRIORITY_LABEL[p]}
          </button>
        ))}
      </div>
      <div className="filter-group">
        <span className="filter-label">Due</span>
        <input type="date" value={f.dueFrom} max={f.dueTo || undefined} onChange={(e) => f.update('dueFrom', e.target.value || null)} aria-label="Due from" />
        <span className="muted">to</span>
        <input type="date" value={f.dueTo} min={f.dueFrom || undefined} onChange={(e) => f.update('dueTo', e.target.value || null)} aria-label="Due to" />
        <button className={`chip${f.overdue ? ' on' : ''}`} onClick={() => f.update('overdue', f.overdue ? null : 'true')}>
          Overdue only
        </button>
        {f.active > 0 && (
          <button className="link-btn" onClick={f.clear}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
