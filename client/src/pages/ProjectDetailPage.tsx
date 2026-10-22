import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Project } from '../api/types';
import { TaskFilters } from '../components/TaskFilters';
import { TaskForm } from '../components/TaskForm';
import { TaskTable } from '../components/TaskTable';
import { ErrorText, Loading, Modal } from '../components/ui';
import { useCreateTask } from '../hooks/useMutations';
import { useTasks } from '../hooks/useQueries';
import { useOpenTask, useTaskFilters } from '../hooks/useTaskFilters';

export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const filters = useTaskFilters({ projectId: id });
  const { open } = useOpenTask();
  const [adding, setAdding] = useState(false);

  const project = useQuery({ queryKey: ['projects', id], queryFn: () => api.get<Project>(`/api/projects/${id}`) });
  const tasks = useTasks(filters.apiQuery);
  const create = useCreateTask(id);

  const remove = useMutation({
    mutationFn: () => api.del(`/api/projects/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      navigate('/projects');
    },
  });

  if (project.isLoading) return <Loading />;
  if (project.error) {
    return (
      <div className="stack">
        <ErrorText error={project.error} />
        <Link to="/projects">← Back to projects</Link>
      </div>
    );
  }
  const p = project.data!;

  return (
    <div className="stack">
      <Link to="/projects" className="muted small">
        ← Projects
      </Link>
      <div className="page-head">
        <div>
          <h1>{p.name}</h1>
          <p className="muted">
            {p.client.name} · managed by {p.createdBy.name}
          </p>
          {p.description && <p>{p.description}</p>}
        </div>
        <div className="row">
          <button className="btn primary" onClick={() => setAdding(true)}>
            Add task
          </button>
          <button
            className="btn danger"
            disabled={remove.isPending}
            onClick={() => window.confirm(`Delete "${p.name}" and all its tasks?`) && remove.mutate()}
          >
            Delete
          </button>
        </div>
      </div>
      <ErrorText error={remove.error} />

      <TaskFilters filters={filters} />
      {tasks.isLoading && <Loading />}
      <ErrorText error={tasks.error} />
      {tasks.data && (
        <section className="card">
          <TaskTable tasks={tasks.data} onOpen={open} showProject={false} />
        </section>
      )}

      {adding && (
        <Modal title="New task" onClose={() => setAdding(false)}>
          <TaskForm
            submitLabel="Create task"
            pending={create.isPending}
            error={create.error}
            onSubmit={(v) => create.mutate(v, { onSuccess: () => setAdding(false) })}
          />
        </Modal>
      )}
    </div>
  );
}
