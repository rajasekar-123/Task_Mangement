import { ReactNode, useEffect } from 'react';
import type { Priority, TaskStatus } from '../api/types';
import { PRIORITY_LABEL, STATUS_LABEL } from '../lib/format';

export const StatusBadge = ({ status }: { status: TaskStatus }) => (
  <span className={`badge status-${status}`}>{STATUS_LABEL[status]}</span>
);

export const PriorityBadge = ({ priority }: { priority: Priority }) => (
  <span className={`badge prio-${priority}`}>{PRIORITY_LABEL[priority]}</span>
);

export const OverdueBadge = () => <span className="badge overdue">Overdue</span>;

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const ErrorText = ({ error }: { error: unknown }) => {
  if (!error) return null;
  const e = error as { message?: string; details?: { path: string; message: string }[] };
  return (
    <div className="error-text" role="alert">
      {e.message ?? 'Something went wrong'}
      {e.details?.length ? (
        <ul>
          {e.details.map((d, i) => (
            <li key={i}>
              {d.path}: {d.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

export const Loading = () => <p className="muted">Loading…</p>;

export function Bars({ items }: { items: { label: string; value: number; className?: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="bars">
      {items.map((i) => (
        <div className="bar-row" key={i.label}>
          <span className="bar-label">{i.label}</span>
          <div className="bar-track">
            <div className={`bar-fill ${i.className ?? ''}`} style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
          <span className="bar-value">{i.value}</span>
        </div>
      ))}
    </div>
  );
}

export const Stat = ({ label, value, tone, live }: { label: string; value: ReactNode; tone?: 'danger'; live?: boolean }) => (
  <div className={`stat${tone ? ` ${tone}` : ''}`}>
    <div className="stat-label">
      {label}
      {live && <span className="live-dot" title="Live" />}
    </div>
    <div className="stat-value">{value}</div>
  </div>
);
