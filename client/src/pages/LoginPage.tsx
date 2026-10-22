import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ErrorText } from '../components/ui';
import { useAuth } from '../context/AuthContext';

const DEMO = [
  ['Admin', 'admin@velozity.dev'],
  ['Project Manager', 'meera.pm@velozity.dev'],
  ['Project Manager', 'karan.pm@velozity.dev'],
  ['Developer', 'ravi@velozity.dev'],
  ['Developer', 'priya@velozity.dev'],
];

export function LoginPage() {
  const { user, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="login">
      <form className="card login-card form" onSubmit={submit}>
        <h1>
          <span className="brand-mark">◉</span> Pulse
        </h1>
        <p className="muted">Sign in to the agency dashboard.</p>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="username" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        <ErrorText error={error} />
        <button className="btn primary" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
        <details className="demo">
          <summary>Demo accounts (seed data)</summary>
          <p className="muted small">
            Password for all: <code>Password123!</code>
          </p>
          <ul>
            {DEMO.map(([role, mail]) => (
              <li key={mail}>
                <button type="button" className="link-btn" onClick={() => { setEmail(mail); setPassword('Password123!'); }}>
                  {mail}
                </button>{' '}
                <span className="muted small">{role}</span>
              </li>
            ))}
          </ul>
        </details>
      </form>
    </div>
  );
}
