import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Ambulance, ArrowRight, MapPin, Plus, Route, Search, X } from 'lucide-react';
import { apiRequest } from '../shared/api';
import { useAuth } from '../shared/AuthProvider';
import { humanize } from '../shared/format';
import type { Ambulance as AmbulanceRecord, Emergency } from '../shared/types';
import StatePill from '../components/StatePill';
import { ErrorState, LoadingState } from '../components/LoadState';

interface Candidate {
  hospitalId: string;
  hospitalName?: string;
  score: number;
  etaMinutes?: number;
  freshnessStatus?: string;
  explanation?: string[];
  warnings?: string[];
}

interface RecommendationResult {
  eligible?: Candidate[];
  ineligible?: Array<{ hospitalName?: string; reasons?: string[] }>;
  disclaimer?: string;
}

function canDispatch(role?: string): boolean {
  return ['coordinator', 'system_admin'].includes(role || '');
}

function canRegister(role?: string): boolean {
  return ['coordinator', 'ambulance_staff', 'system_admin'].includes(role || '');
}

export default function EmergenciesPage() {
  const { user } = useAuth();
  const [cases, setCases] = useState<Emergency[]>([]);
  const [ambulances, setAmbulances] = useState<AmbulanceRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [recommendationCase, setRecommendationCase] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationResult | null>(null);
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [selectedAmbulance, setSelectedAmbulance] = useState<Record<string, string>>({});
  const [busyCase, setBusyCase] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [caseResult, ambulanceResult] = await Promise.allSettled([
        apiRequest<Emergency[]>('/emergencies'),
        apiRequest<AmbulanceRecord[]>('/ambulances'),
      ]);
      if (caseResult.status === 'rejected') {
        throw caseResult.reason;
      }
      setCases(Array.isArray(caseResult.value) ? caseResult.value : []);
      if (ambulanceResult.status === 'fulfilled') {
        setAmbulances(Array.isArray(ambulanceResult.value) ? ambulanceResult.value : []);
      } else {
        setAmbulances([]);
        setNotice('Emergency cases loaded, but ambulance availability could not be fetched.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load emergencies.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const visibleCases = cases.filter((item) =>
    `${item.caseId} ${item.summary || ''} ${item.status}`.toLowerCase().includes(search.toLowerCase()),
  );

  async function findRecommendations(item: Emergency) {
    setRecommendationCase(item.caseId);
    setRecommendations(null);
    setRecommendLoading(true);
    setError('');
    try {
      const result = await apiRequest<RecommendationResult>('/recommendations', {
        method: 'POST',
        body: JSON.stringify({ caseId: item.caseId }),
      });
      setRecommendations(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to request hospital recommendations.');
      setRecommendationCase(null);
    } finally {
      setRecommendLoading(false);
    }
  }

  async function createReferral(caseId: string, hospitalId: string) {
    setBusyCase(caseId);
    setError('');
    try {
      await apiRequest('/referrals', { method: 'POST', body: JSON.stringify({ caseId, hospitalId }) });
      setNotice(`Referral created for ${caseId}. The receiving hospital must accept before a destination is confirmed.`);
      setRecommendationCase(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create referral.');
    } finally {
      setBusyCase('');
    }
  }

  async function assignAmbulance(item: Emergency) {
    const ambulanceId = selectedAmbulance[item.caseId];
    if (!ambulanceId) return;
    setBusyCase(item.caseId);
    setError('');
    try {
      await apiRequest('/assignments', {
        method: 'POST',
        body: JSON.stringify({ caseId: item.caseId, ambulanceId }),
      });
      setNotice(`Ambulance assigned to ${item.caseId}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to assign ambulance.');
    } finally {
      setBusyCase('');
    }
  }

  if (loading) return <LoadingState label="Loading emergency cases…" />;

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div><div className="eyebrow">CASE MANAGEMENT</div><h1>Emergency cases</h1><p>Track case status and coordinate the next operational action.</p></div>
        {user && canRegister(user.role) && <button className="button button-primary" onClick={() => setShowCreate(true)}><Plus size={17} /> Register emergency</button>}
      </div>
      {error && <ErrorState message={error} />}
      {notice && <div className="notice-banner" role="status">{notice}<button aria-label="Dismiss" onClick={() => setNotice('')}><X size={16} /></button></div>}

      <div className="toolbar"><label className="search-box"><Search size={17} /><input aria-label="Search cases" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search case, summary, or status" /></label><span className="toolbar-count">{visibleCases.length} cases</span></div>

      {visibleCases.length ? <section className="case-grid">
        {visibleCases.map((item) => (
          <article className="case-card" key={item._id || item.caseId}>
            <div className="case-card-top"><span className="case-id">{item.caseId}</span><StatePill value={item.priorityCategory} /></div>
            <h2>{item.summary || 'Emergency coordination case'}</h2>
            <div className="case-meta"><StatePill value={item.status} />{item.createdAt && <span>{new Date(item.createdAt).toLocaleString()}</span>}</div>
            {item.status === 'destination_confirmed' && canDispatch(user?.role || 'observer') && (
              <div className="inline-action">
                <label className="sr-only" htmlFor={`ambulance-${item.caseId}`}>Choose available ambulance</label>
                <select id={`ambulance-${item.caseId}`} className="select" value={selectedAmbulance[item.caseId] || ''} onChange={(event) => setSelectedAmbulance((prev) => ({ ...prev, [item.caseId]: event.target.value }))}>
                  <option value="">Choose available ambulance</option>
                  {ambulances.filter((ambulance) => ambulance.status === 'available').map((ambulance) => <option key={ambulance._id} value={ambulance._id}>{ambulance.ambulanceId}</option>)}
                </select>
                <button className="button button-primary button-small" onClick={() => void assignAmbulance(item)} disabled={!selectedAmbulance[item.caseId] || busyCase === item.caseId}><Ambulance size={15} /> Assign</button>
              </div>
            )}
            <div className="case-actions">
              {['coordinator', 'system_admin'].includes(user?.role || '') && ['registered', 'referral_pending'].includes(item.status) && (
                <button className="button button-secondary button-small" onClick={() => void findRecommendations(item)}><Route size={15} /> Find hospitals</button>
              )}
              <span className="case-next">{item.confirmedHospitalId ? 'Destination confirmed' : 'Human review required'} <ArrowRight size={14} /></span>
            </div>
          </article>
        ))}
      </section> : <div className="empty-state panel-card">No cases match this view. Cases are scoped by your account permissions.</div>}

      {showCreate && <CreateEmergencyModal onClose={() => setShowCreate(false)} onCreated={async (item) => { setShowCreate(false); setNotice(`Emergency ${item.caseId} registered.`); await load(); }} />}
      {recommendationCase && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRecommendationCase(null); }}>
        <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="recommendation-title">
          <div className="modal-heading"><div><div className="eyebrow">DECISION SUPPORT · {recommendationCase}</div><h2 id="recommendation-title">Hospital recommendations</h2></div><button className="icon-button" onClick={() => setRecommendationCase(null)} aria-label="Close"><X size={19} /></button></div>
          {recommendLoading ? <LoadingState label="Calculating eligible hospitals…" /> : <>
            <p className="modal-copy">{recommendations?.disclaimer || 'Rankings support coordination only; destination is confirmed only after hospital acceptance.'}</p>
            {recommendations?.eligible?.length ? <div className="candidate-list">{recommendations.eligible.map((candidate) => <article className="candidate-card" key={candidate.hospitalId}>
              <div className="candidate-main"><div><strong>{candidate.hospitalName || 'Hospital'}</strong><p>{candidate.etaMinutes != null ? `${candidate.etaMinutes} min estimated travel` : 'Travel estimate unavailable'} · {humanize(candidate.freshnessStatus)}</p></div><strong className="candidate-score">{Math.round(candidate.score)}<small> score</small></strong></div>
              {!!candidate.explanation?.length && <ul className="explanation-list">{candidate.explanation.slice(0, 3).map((line) => <li key={line}>{line}</li>)}</ul>}
              <button className="button button-primary button-small" disabled={busyCase === recommendationCase} onClick={() => void createReferral(recommendationCase, candidate.hospitalId)}>Request referral <ArrowRight size={15} /></button>
            </article>)}</div> : <div className="empty-state">No eligible hospitals were returned. Review hospital capabilities and resource freshness.</div>}
            {!!recommendations?.ineligible?.length && <details className="ineligible-details"><summary>{recommendations.ineligible.length} hospitals marked ineligible</summary>{recommendations.ineligible.map((candidate, index) => <p key={`${candidate.hospitalName}-${index}`}><strong>{candidate.hospitalName || 'Hospital'}:</strong> {candidate.reasons?.join(', ') || 'Does not meet current case requirements'}</p>)}</details>}
          </>}
        </section>
      </div>}
    </div>
  );
}

function CreateEmergencyModal({ onClose, onCreated }: { onClose: () => void; onCreated: (item: Emergency) => Promise<void> }) {
  const [summary, setSummary] = useState('');
  const [priority, setPriority] = useState('urgent');
  const [resourceType, setResourceType] = useState('icu_bed');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const created = await apiRequest<Emergency>('/emergencies', {
        method: 'POST',
        body: JSON.stringify({
          summary,
          priorityCategory: priority,
          requiredResources: [{ resourceType, minCount: 1 }],
          pickupLocation: { lat: Number(lat), lng: Number(lng), address },
        }),
      });
      await onCreated(created);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not register emergency.');
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="modal-card form-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="create-case-title">
      <div className="modal-heading"><div><div className="eyebrow">NEW COORDINATION CASE</div><h2 id="create-case-title">Register emergency</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
      <p className="modal-copy">Enter only the operational details needed for coordination. Do not include patient names or identifying information.</p>
      <label className="field-label" htmlFor="case-summary">Short non-identifying summary</label><input id="case-summary" className="input" required maxLength={500} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="e.g. Adult, suspected cardiac event" />
      <div className="form-row"><div><label className="field-label" htmlFor="case-priority">Operational priority</label><select id="case-priority" className="select" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="critical">Critical</option><option value="urgent">Urgent</option><option value="standard">Standard</option></select></div><div><label className="field-label" htmlFor="case-resource">Required resource</label><select id="case-resource" className="select" value={resourceType} onChange={(event) => setResourceType(event.target.value)}><option value="icu_bed">ICU bed</option><option value="er_bed">ER bed</option><option value="ventilator">Ventilator</option><option value="cardiologist_on_call">Cardiologist on call</option><option value="trauma_team">Trauma team</option></select></div></div>
      <div className="form-row"><div><label className="field-label" htmlFor="case-lat">Pickup latitude</label><input id="case-lat" className="input" type="number" step="any" required value={lat} onChange={(event) => setLat(event.target.value)} /></div><div><label className="field-label" htmlFor="case-lng">Pickup longitude</label><input id="case-lng" className="input" type="number" step="any" required value={lng} onChange={(event) => setLng(event.target.value)} /></div></div>
      <label className="field-label" htmlFor="case-address"><MapPin size={14} /> Fictional pickup address</label><input id="case-address" className="input" required value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Area or street (demo data only)" />
      {error && <div className="form-alert" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={submitting}>{submitting ? 'Registering…' : 'Register case'} <ArrowRight size={16} /></button></div>
    </form>
  </div>;
}
