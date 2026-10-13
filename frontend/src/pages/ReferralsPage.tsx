import { useCallback, useEffect, useState } from 'react';
import { Check, MessageSquareText, X } from 'lucide-react';
import { apiRequest } from '../shared/api';
import { useAuth } from '../shared/AuthProvider';
import { humanize } from '../shared/format';
import type { Referral } from '../shared/types';
import StatePill from '../components/StatePill';
import { ErrorState, LoadingState } from '../components/LoadState';

function hospitalName(value: Referral['hospitalId']): string {
  return typeof value === 'object' && value ? value.name || 'Hospital' : value || 'Hospital';
}

export default function ReferralsPage() {
  const { user } = useAuth();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const canRespond = ['hospital_staff', 'hospital_admin', 'system_admin'].includes(user?.role || '');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest<Referral[]>('/referrals');
      setReferrals(Array.isArray(result) ? result : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load referrals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function respond(referral: Referral, decision: 'accepted' | 'rejected' | 'clarification_requested') {
    const note = decision === 'accepted' ? 'Accepted via EmergencyLink operations workspace' : '';
    setBusyId(referral._id);
    setError('');
    try {
      await apiRequest(`/referrals/${referral._id}/respond`, { method: 'PATCH', body: JSON.stringify({ decision, note }) });
      setNotice(`Referral ${referral._id} marked ${humanize(decision).toLowerCase()}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to respond to this referral.');
    } finally {
      setBusyId('');
    }
  }

  if (loading) return <LoadingState label="Loading referral queue…" />;

  return <div className="page-stack">
    <div className="page-heading"><div><div className="eyebrow">HOSPITAL COORDINATION</div><h1>Referral queue</h1><p>Referral requests remain unconfirmed until the receiving hospital accepts.</p></div><span className="toolbar-count">{referrals.filter((item) => item.requestStatus === 'pending').length} pending</span></div>
    {error && <ErrorState message={error} />}
    {notice && <div className="notice-banner" role="status">{notice}<button aria-label="Dismiss" onClick={() => setNotice('')}><X size={16} /></button></div>}
    <div className="panel-card">
      {referrals.length ? <div className="table-wrap"><table><thead><tr><th>Case</th><th>Hospital</th><th>Requested</th><th>Status</th>{canRespond && <th>Action</th>}</tr></thead><tbody>{referrals.map((item) => <tr key={item._id}><td><strong>{item.caseId}</strong></td><td>{hospitalName(item.hospitalId)}</td><td>{item.requestedAt ? new Date(item.requestedAt).toLocaleString() : '—'}</td><td><StatePill value={item.requestStatus} /></td>{canRespond && <td>{item.requestStatus === 'pending' ? <div className="table-actions"><button className="button button-primary button-small" disabled={busyId === item._id} onClick={() => void respond(item, 'accepted')}><Check size={14} /> Accept</button><button className="button button-danger button-small" disabled={busyId === item._id} onClick={() => void respond(item, 'rejected')}><X size={14} /> Reject</button><button className="icon-button" title="Request clarification" disabled={busyId === item._id} onClick={() => void respond(item, 'clarification_requested')}><MessageSquareText size={16} /></button></div> : <span className="muted">No action</span>}</td>}</tr>)}</tbody></table></div> : <div className="empty-state">No referrals are visible for your account.</div>}
    </div>
    <div className="info-banner"><strong>Human confirmation required.</strong> A recommendation is not an acceptance or a confirmed destination.</div>
  </div>;
}
