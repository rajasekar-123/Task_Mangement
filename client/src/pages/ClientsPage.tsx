import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { api } from '../api/client';
import { ErrorText, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useClients } from '../hooks/useQueries';

export function ClientsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const qc = useQueryClient();
  const { data, isLoading, error } = useClients();
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  const create = useMutation({
    mutationFn: () => api.post('/api/clients', { name, contactEmail: contactEmail || null }),
    onSuccess: () => {
      setName('');
      setContactEmail('');
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <div className="stack">
      <h1>Clients</h1>
      {isAdmin && (
        <form className="card form inline-form" onSubmit={submit}>
          <input placeholder="Client name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={150} />
          <input placeholder="Contact email (optional)" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          <button className="btn primary" disabled={create.isPending}>
            Add client
          </button>
        </form>
      )}
      <ErrorText error={create.error} />
      {isLoading && <Loading />}
      <ErrorText error={error} />
      <section className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Contact</th>
                <th>Projects</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.contactEmail ?? <span className="muted">—</span>}</td>
                  <td>{c._count.projects}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!isAdmin && <p className="muted small">Only admins can add or edit clients.</p>}
      </section>
    </div>
  );
}
