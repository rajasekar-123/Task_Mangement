import { useRealtime } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { useNow } from '../hooks/useNow';
import { useOpenTask } from '../hooks/useTaskFilters';
import { useActivity } from '../hooks/useQueries';
import { activitySentence, timeAgo } from '../lib/format';
import { ErrorText, Loading } from './ui';

const SCOPE_HINT = {
  ADMIN: 'All projects',
  PROJECT_MANAGER: 'Your projects',
  DEVELOPER: 'Your tasks',
} as const;

export function ActivityFeed() {
  const { user } = useAuth();
  const { connected } = useRealtime();
  const { data, isLoading, error } = useActivity();
  const now = useNow();
  const { open } = useOpenTask();

  return (
    <section className="card feed">
      <header className="card-head">
        <h2>Activity</h2>
        <span className={`live-pill${connected ? ' on' : ''}`}>{connected ? 'Live' : 'Reconnecting…'}</span>
      </header>
      {user && <p className="muted small feed-scope">{SCOPE_HINT[user.role]} · last {data?.length ?? 20} events</p>}
      {isLoading && <Loading />}
      <ErrorText error={error} />
      {data?.length === 0 && <p className="empty">No activity yet.</p>}
      <ul className="feed-list">
        {data?.map((a) => {
          const s = activitySentence(a);
          return (
            <li key={a.id} className="feed-item">
              <span className={`feed-dot ${a.type}`} />
              <div>
                <div>
                  <strong>{s.actor}</strong> {a.taskId ? <button className="link-btn inline" onClick={() => open(a.taskId)} title={a.taskTitle ?? ''}>{s.text}</button> : s.text}
                  <span className="muted"> · {timeAgo(a.createdAt, now)}</span>
                </div>
                <div className="muted small">
                  {a.taskTitle} — {a.projectName}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
