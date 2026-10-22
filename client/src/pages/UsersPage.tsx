import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { api } from '../api/client';
import type { Role } from '../api/types';
import { ErrorText, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useUsers } from '../hooks/useQueries';
import { ROLE_LABEL } from '../lib/format';

const ROLES = Object.keys(ROLE_LABEL) as Role[];

export function UsersPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error } = useUsers();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'DEVELOPER' as Role });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });
  const create = useMutation({
    mutationFn: () => api.post('/api/users', form),
    onSuccess: () => {
      setForm({ name: '', email: '', password: '', role: 'DEVELOPER' });
      invalidate();
    },
  });
  const patch = useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: Role; isActive?: boolean }) => api.patch(`/api/users/${id}`, body),
    onSuccess: invalidate,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <div className="stack">
      <h1>Users</h1>
      <form className="card form inline-form" onSubmit={submit}>
        <input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <input placeholder="Temp password (8+ chars)" type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <button className="btn primary" disabled={create.isPending}>
          Add user
        </button>
      </form>
      <ErrorText error={create.error ?? patch.error} />
      {isLoading && <Loading />}
      <ErrorText error={error} />
      <section className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((u) => (
                <tr key={u.id} className={u.isActive ? '' : 'row-muted'}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <select value={u.role} disabled={u.id === me?.id} onChange={(e) => patch.mutate({ id: u.id, role: e.target.value as Role })}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input type="checkbox" checked={u.isActive} disabled={u.id === me?.id} aria-label={`${u.name} active`} onChange={(e) => patch.mutate({ id: u.id, isActive: e.target.checked })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
