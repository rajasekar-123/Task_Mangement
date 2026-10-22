import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { AppNotification } from '../api/types';
import { useNotifications } from '../hooks/useQueries';
import { useNow } from '../hooks/useNow';
import { timeAgo } from '../lib/format';

export function NotificationBell() {
  const { data } = useNotifications();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const markOne = useMutation({ mutationFn: (id: string) => api.post(`/api/notifications/${id}/read`), onSuccess: refresh });
  const markAll = useMutation({ mutationFn: () => api.post('/api/notifications/read-all'), onSuccess: refresh });

  const unread = data?.unreadCount ?? 0;

  const clickItem = (n: AppNotification) => {
    if (!n.read) markOne.mutate(n.id);
    setOpen(false);
    if (n.taskId) navigate(`/tasks?task=${n.taskId}`);
  };

  return (
    <div className="bell" ref={ref}>
      <button className="icon-btn" aria-label={`Notifications, ${unread} unread`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        🔔
        {unread > 0 && <span className="badge-count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="dropdown" role="menu">
          <div className="dropdown-head">
            <strong>Notifications</strong>
            <button className="link-btn" disabled={unread === 0 || markAll.isPending} onClick={() => markAll.mutate()}>
              Mark all read
            </button>
          </div>
          {data?.data.length === 0 && <p className="empty">You're all caught up.</p>}
          <ul>
            {data?.data.map((n) => (
              <li key={n.id} className={n.read ? 'read' : 'unread'}>
                <button onClick={() => clickItem(n)}>
                  <span>{n.message}</span>
                  <span className="muted small">{timeAgo(n.createdAt, now)}</span>
                </button>
                {!n.read && (
                  <button className="link-btn small" onClick={() => markOne.mutate(n.id)} aria-label="Mark as read">
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
