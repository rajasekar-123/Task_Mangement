import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/SocketContext';
import { ROLE_LABEL } from '../lib/format';
import { useOpenTask } from '../hooks/useTaskFilters';
import { NotificationBell } from './NotificationBell';
import { TaskModal } from './TaskModal';

export function Layout() {
  const { user, signOut } = useAuth();
  const { connected } = useRealtime();
  const { id: openTaskId, open } = useOpenTask();
  if (!user) return null;

  const nav = [
    { to: '/', label: 'Dashboard', end: true, show: true },
    { to: '/projects', label: 'Projects', show: user.role !== 'DEVELOPER' },
    { to: '/tasks', label: user.role === 'DEVELOPER' ? 'My tasks' : 'Tasks', show: true },
    { to: '/clients', label: 'Clients', show: user.role !== 'DEVELOPER' },
    { to: '/users', label: 'Users', show: user.role === 'ADMIN' },
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">◉</span> Pulse
        </div>
        <nav>
          {nav
            .filter((n) => n.show)
            .map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>
                {n.label}
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-foot">
          <span className={`conn ${connected ? 'on' : ''}`}>{connected ? 'Realtime connected' : 'Offline — reconnecting'}</span>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-spacer" />
          <NotificationBell />
          <div className="me">
            <div>
              <strong>{user.name}</strong>
              <div className="muted small">{ROLE_LABEL[user.role]}</div>
            </div>
            <button className="btn" onClick={signOut}>
              Sign out
            </button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
        {openTaskId && <TaskModal id={openTaskId} onClose={() => open(null)} />}
      </div>
    </div>
  );
}
