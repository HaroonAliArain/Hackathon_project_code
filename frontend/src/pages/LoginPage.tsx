import { FormEvent, useState } from 'react';
import { Activity, ArrowRight, LockKeyhole } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../shared/AuthProvider';
import { ApiError } from '../shared/api';

export default function LoginPage() {
  const { user, signIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      const destination = (location.state as { from?: string } | null)?.from || '/';
      navigate(destination, { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 401
        ? 'Email or password was not recognized.'
        : cause instanceof Error ? cause.message : 'Unable to sign in right now.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-story">
        <div className="brand brand-light">
          <span className="brand-mark"><Activity size={20} strokeWidth={2.5} /></span>
          <span className="brand-text">Emergency<span>Link</span></span>
        </div>
        <div className="story-content">
          <div className="eyebrow eyebrow-light"><span className="live-dot" /> OPERATIONAL COORDINATION</div>
          <h1>When every minute matters, clarity matters more.</h1>
          <p>One coordinated view of emergency cases, hospital resources, referrals, and ambulance status.</p>
        </div>
        <div className="story-footnote">A human-led coordination workspace. Decisions remain with qualified teams.</div>
      </section>

      <section className="login-form-side">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-icon"><LockKeyhole size={20} /></div>
          <div className="eyebrow">WELCOME BACK</div>
          <h2>Sign in to your workspace</h2>
          <p className="muted">Use your authorized EmergencyLink account to continue.</p>
          <label className="field-label" htmlFor="email">Email address</label>
          <input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@hospital.org" />
          <label className="field-label" htmlFor="password">Password</label>
          <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" />
          {error && <div className="form-alert" role="alert">{error}</div>}
          <button className="button button-primary login-submit" type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'} {!submitting && <ArrowRight size={17} />}
          </button>
          <div className="login-note">Access is protected by your assigned role and organization.</div>
        </form>
      </section>
    </div>
  );
}
