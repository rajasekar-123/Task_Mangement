import { TaskFilters } from '../components/TaskFilters';
import { TaskTable } from '../components/TaskTable';
import { ErrorText, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useTaskFilters, useOpenTask } from '../hooks/useTaskFilters';
import { useTasks } from '../hooks/useQueries';

export function TasksPage() {
  const { user } = useAuth();
  const filters = useTaskFilters();
  const { open } = useOpenTask();
  const { data, isLoading, error } = useTasks(filters.apiQuery);
  const isDev = user?.role === 'DEVELOPER';

  return (
    <div className="stack">
      <h1>{isDev ? 'My tasks' : 'Tasks'}</h1>
      <TaskFilters filters={filters} />
      {isLoading && <Loading />}
      <ErrorText error={error} />
      {data && (
        <section className="card">
          <p className="muted small">{data.length} task{data.length === 1 ? '' : 's'} · sorted by priority, then due date</p>
          <TaskTable tasks={data} onOpen={open} showAssignee={!isDev} />
        </section>
      )}
    </div>
  );
}
