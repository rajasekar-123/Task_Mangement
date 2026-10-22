import { Link } from 'react-router-dom';
import type { AdminDashboard, DevDashboard, PmDashboard } from '../api/types';
import { ActivityFeed } from '../components/ActivityFeed';
import { TaskTable } from '../components/TaskTable';
import { Bars, ErrorText, Loading, PriorityBadge, Stat } from '../components/ui';
import { useRealtime } from '../context/SocketContext';
import { useDashboard } from '../hooks/useQueries';
import { useOpenTask } from '../hooks/useTaskFilters';
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, formatDate } from '../lib/format';

export function DashboardPage() {
  const { data, isLoading, error } = useDashboard();
  return (
    <div className="two-col">
      <div className="stack">
        <h1>Dashboard</h1>
        {isLoading && <Loading />}
        <ErrorText error={error} />
        {data?.role === 'ADMIN' && <Admin d={data} />}
        {data?.role === 'PROJECT_MANAGER' && <Pm d={data} />}
        {data?.role === 'DEVELOPER' && <Dev d={data} />}
      </div>
      <ActivityFeed />
    </div>
  );
}

function Admin({ d }: { d: AdminDashboard }) {
  const { onlineUsers } = useRealtime();
  return (
    <>
      <div className="stats">
        <Stat label="Projects" value={d.totalProjects} />
        <Stat label="Tasks" value={d.totalTasks} />
        <Stat label="Overdue" value={d.overdueCount} tone={d.overdueCount > 0 ? 'danger' : undefined} />
        <Stat label="Online now" value={onlineUsers ?? d.onlineUsers} live />
      </div>
      <section className="card">
        <h2>Tasks by status</h2>
        <Bars items={STATUSES.map((s) => ({ label: STATUS_LABEL[s], value: d.tasksByStatus[s], className: `status-${s}` }))} />
      </section>
      <div className="stats">
        <Stat label="Clients" value={d.totalClients} />
        <Stat label="Active users" value={d.totalUsers} />
      </div>
    </>
  );
}

function Pm({ d }: { d: PmDashboard }) {
  const { open } = useOpenTask();
  return (
    <>
      <div className="stats">
        <Stat label="Your projects" value={d.projects.length} />
        <Stat label="Overdue" value={d.overdueCount} tone={d.overdueCount > 0 ? 'danger' : undefined} />
        <Stat label="Due this week" value={d.upcomingThisWeek.length} />
      </div>
      <section className="card">
        <h2>Projects</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {d.projects.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/projects/${p.id}`}>{p.name}</Link>
                  </td>
                  <td>{p.clientName}</td>
                  <td>
                    <div className="progress">
                      <div style={{ width: `${p.totalTasks ? (p.doneTasks / p.totalTasks) * 100 : 0}%` }} />
                    </div>
                    <span className="muted small">
                      {p.doneTasks}/{p.totalTasks} done
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <h2>Tasks by priority</h2>
        <Bars items={PRIORITIES.map((p) => ({ label: PRIORITY_LABEL[p], value: d.tasksByPriority[p], className: `prio-${p}` }))} />
      </section>
      <section className="card">
        <h2>Upcoming due dates · next 7 days</h2>
        {d.upcomingThisWeek.length === 0 && <p className="empty">Nothing due this week.</p>}
        <ul className="plain-list">
          {d.upcomingThisWeek.map((t) => (
            <li key={t.id}>
              <button className="link-btn" onClick={() => open(t.id)}>
                #{t.id} {t.title}
              </button>
              <span className="muted small"> · {t.projectName} · {t.assignee?.name ?? 'Unassigned'}</span>
              <span className="right">
                <PriorityBadge priority={t.priority} /> {formatDate(t.dueDate)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Dev({ d }: { d: DevDashboard }) {
  const { open } = useOpenTask();
  return (
    <>
      <div className="stats">
        {STATUSES.map((s) => (
          <Stat key={s} label={STATUS_LABEL[s]} value={d.tasksByStatus[s]} />
        ))}
        <Stat label="Overdue" value={d.overdueCount} tone={d.overdueCount > 0 ? 'danger' : undefined} />
      </div>
      <section className="card">
        <h2>Assigned to you</h2>
        <p className="muted small">Sorted by priority, then due date.</p>
        <TaskTable tasks={d.tasks} onOpen={open} showAssignee={false} />
      </section>
    </>
  );
}
