import { useCallback, useEffect, useState } from 'react';
import { Activity, Ambulance, ArrowUpRight, Building2, ClipboardList, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../shared/api';
import type { DashboardSummary, Emergency, Hospital, Referral, Ambulance as AmbulanceRecord } from '../shared/types';
import { humanize, shortDate } from '../shared/format';
import StatePill from '../components/StatePill';
import { ErrorState, LoadingState } from '../components/LoadState';

interface DashboardData {
  summary: DashboardSummary;
  emergencies: Emergency[];
  hospitals: Hospital[];
  referrals: Referral[];
  ambulances: AmbulanceRecord[];
}

function unwrapList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object' && 'items' in value && Array.isArray(value.items)) return value.items as T[];
  return [];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [summary, emergencies, hospitals, referrals, ambulances] = await Promise.all([
        apiRequest<DashboardSummary>('/dashboard/summary'),
        apiRequest<Emergency[] | { items: Emergency[] }>('/emergencies'),
        apiRequest<Hospital[]>('/hospitals'),
        apiRequest<Referral[]>('/referrals'),
        apiRequest<AmbulanceRecord[]>('/ambulances'),
      ]);
      setData({
        summary,
        emergencies: unwrapList<Emergency>(emergencies),
        hospitals: unwrapList<Hospital>(hospitals),
        referrals: unwrapList<Referral>(referrals),
        ambulances: unwrapList<AmbulanceRecord>(ambulances),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load the operations overview.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <LoadingState label="Preparing operations overview…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data) return null;

  const activeCases = data.summary.activeCases ?? data.emergencies.filter((caseItem) => !['closed', 'cancelled'].includes(caseItem.status)).length;
  const pendingReferrals = data.summary.pendingReferrals ?? data.referrals.filter((item) => item.requestStatus === 'pending').length;
  const availableAmbulances = data.summary.ambulanceStatuses?.available ?? data.ambulances.filter((item) => item.status === 'available').length;
  const hospitalsActive = data.hospitals.filter((item) => item.status === 'active').length;
  const recent = data.summary.recentEmergencies?.length ? data.summary.recentEmergencies : data.emergencies;

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div><div className="eyebrow">COMMAND CENTER</div><h1>Operations overview</h1><p>Live situational awareness across cases, facilities, and transport.</p></div>
        <button className="button button-secondary" onClick={() => void load()}><RefreshCw size={16} /> Refresh data</button>
      </div>

      <section className="stats-grid" aria-label="Key operational metrics">
        <Metric icon={Activity} label="Active emergencies" value={activeCases} tint="mint" foot="Cases in progress" />
        <Metric icon={ClipboardList} label="Pending referrals" value={pendingReferrals} tint="amber" foot="Awaiting hospital response" />
        <Metric icon={Ambulance} label="Available ambulances" value={availableAmbulances} tint="blue" foot="Ready for assignment" />
        <Metric icon={Building2} label="Active hospitals" value={hospitalsActive} tint="violet" foot="Receiving coordination requests" />
      </section>

      <section className="content-grid">
        <div className="panel-card panel-main">
          <div className="panel-heading"><div><h2>Recent emergencies</h2><p>Latest registered cases and current status</p></div><Link className="text-link" to="/emergencies">View all <ArrowUpRight size={15} /></Link></div>
          {recent.length ? <div className="table-wrap"><table><thead><tr><th>Case</th><th>Priority</th><th>Status</th><th>Updated</th></tr></thead><tbody>{recent.slice(0, 7).map((item) => <tr key={item._id || item.caseId}><td><strong>{item.caseId}</strong><small>{item.summary || 'Coordination case'}</small></td><td><StatePill value={item.priorityCategory} /></td><td><StatePill value={item.status} /></td><td>{shortDate(item.createdAt)}</td></tr>)}</tbody></table></div> : <div className="empty-state">No emergency cases to display yet.</div>}
        </div>
        <div className="panel-card freshness-card">
          <div className="panel-heading"><div><h2>Resource confidence</h2><p>Latest reported resource data</p></div><Link className="icon-link" to="/hospitals" aria-label="Open hospitals"><ArrowUpRight size={18} /></Link></div>
          <div className="freshness-list">
            {Object.entries(data.summary.freshnessBreakdown || {}).map(([status, count]) => (
              <div className="freshness-row" key={status}><span className={`freshness-dot dot-${status}`} /><span>{humanize(status)}</span><strong>{count}</strong></div>
            ))}
            {!Object.keys(data.summary.freshnessBreakdown || {}).length && <p className="empty-note">Freshness details are not available.</p>}
          </div>
          <div className="confidence-note">Resource freshness is computed by the server and may change over time.</div>
        </div>
      </section>

      <section className="action-strip">
        <div><span className="action-icon"><Activity size={18} /></span><div><strong>Keep the workflow moving</strong><p>Review referrals, confirm capacity, and coordinate the next safe operational step.</p></div></div>
        <Link className="button button-primary" to="/emergencies">Open case board <ArrowUpRight size={16} /></Link>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value, tint, foot }: { icon: typeof Activity; label: string; value: number; tint: string; foot: string }) {
  return <article className="metric-card"><div className={`metric-icon tint-${tint}`}><Icon size={19} /></div><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-foot">{foot}</span></article>;
}
