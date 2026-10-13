import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Shield, UserRound, X } from 'lucide-react';
import { apiRequest } from '../shared/api';
import { useAuth } from '../shared/AuthProvider';
import { humanize, userScope } from '../shared/format';
import type { User } from '../shared/types';
import StatePill from '../components/StatePill';
import { ErrorState, LoadingState } from '../components/LoadState';

interface AdminUser extends User {
  _id: string;
}

export default function TeamPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const routeNotice = (location.state as { notice?: string } | null)?.notice;
    if (routeNotice) {
      setNotice(routeNotice);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest<AdminUser[]>('/users');
      setUsers(Array.isArray(result) ? result : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load team accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function toggleStatus(target: AdminUser) {
    const accountStatus = target.accountStatus === 'disabled' ? 'active' : 'disabled';
    setError('');
    try {
      await apiRequest(`/users/${target._id}`, { method: 'PATCH', body: JSON.stringify({ accountStatus }) });
      setNotice(`${target.email} is now ${accountStatus}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update account.');
    }
  }

  if (loading) return <LoadingState label="Loading authorized accounts…" />;

  return <div className="page-stack">
    <div className="page-heading"><div><div className="eyebrow">ACCESS MANAGEMENT</div><h1>Team & access</h1><p>Manage accounts within the scope permitted to your administrator role.</p></div><Link className="button button-primary" to="/team/new">Register user <ArrowRight size={16} /></Link></div>
    {error && <ErrorState message={error} />}
    {notice && <div className="notice-banner" role="status">{notice}<button aria-label="Dismiss" onClick={() => setNotice('')}><X size={16} /></button></div>}
    <div className="panel-card">
      {users.length ? <div className="table-wrap"><table><thead><tr><th>Account</th><th>Role</th><th>Organization scope</th><th>Status</th><th>Action</th></tr></thead><tbody>{users.map((target) => <tr key={target._id}><td><div className="user-cell"><span className="user-avatar"><UserRound size={16} /></span><span><strong>{target.name}</strong><small>{target.email}</small></span></div></td><td>{humanize(target.role)}</td><td>{userScope(target.hospitalId) || userScope(target.ambulanceId) || 'System-wide'}</td><td><StatePill value={target.accountStatus || 'active'} /></td><td><button className="button button-quiet button-small" disabled={target._id === (user?._id || user?.id)} onClick={() => void toggleStatus(target)}>{target.accountStatus === 'disabled' ? 'Enable' : 'Disable'}</button></td></tr>)}</tbody></table></div> : <div className="empty-state">No team accounts found.</div>}
    </div>
    <div className="info-banner"><Shield size={16} /> Role and organization checks remain enforced by the backend regardless of what is displayed here.</div>
  </div>;
}
