import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Project } from '../api/types';
import { ErrorText, Loading, Modal } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useClients, useProjects } from '../hooks/useQueries';
import { formatDate } from '../lib/format';

export function ProjectsPage() {
  const { user } = useAuth();
  const { data, isLoading, error } = useProjects();
  const [creating, setCreating] = useState(false);

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Projects</h1>
        <button className="btn primary" onClick={() => setCreating(true)}>
          New project
        </button>
      </div>
      {user?.role === 'PROJECT_MANAGER' && <p className="muted small">You only see projects you created.</p>}
      {isLoading && <Loading />}
      <ErrorText error={error} />
      {data?.length === 0 && <p className="empty">No projects yet.</p>}
      <div className="grid">
        {data?.map((p) => (
          <Link key={p.id} to={`/projects/${p.id}`} className="card project-card">
            <h3>{p.name}</h3>
            <p className="muted">{p.client.name}</p>
            <p className="small">{p.description || 'No description.'}</p>
            <div className="muted small">
              {p._count.tasks} tasks · PM {p.createdBy.name} · {formatDate(p.createdAt)}
            </div>
          </Link>
        ))}
      </div>
      {creating && <NewProject onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewProject({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: clients = [] } = useClients();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState('');

  const create = useMutation({
    mutationFn: () => api.post<Project>('/api/projects', { name, description, clientId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <Modal title="New project" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={150} autoFocus />
        </label>
        <label>
          Client
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            <option value="">Select a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </label>
        <ErrorText error={create.error} />
        <button className="btn primary" disabled={create.isPending}>
          Create project
        </button>
      </form>
    </Modal>
  );
}
