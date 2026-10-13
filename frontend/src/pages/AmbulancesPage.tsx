import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Ambulance as AmbulanceIcon, MapPin, Plus, Save, X } from 'lucide-react';
import { apiRequest } from '../shared/api';
import { useAuth } from '../shared/AuthProvider';
import { userScope } from '../shared/format';
import type { Ambulance, Hospital } from '../shared/types';
import StatePill from '../components/StatePill';
import { ErrorState, LoadingState } from '../components/LoadState';

const transitions: Record<string, string[]> = {
  available: ['unavailable'],
  assigned: ['en_route', 'unavailable'],
  en_route: ['arrived', 'unavailable'],
  arrived: ['available', 'unavailable'],
  unavailable: ['available'],
};

export default function AmbulancesPage() {
  const { user } = useAuth();
  const [fleet, setFleet] = useState<Ambulance[]>([]);
  const [nextStatus, setNextStatus] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const canUpdate = ['coordinator', 'ambulance_staff', 'system_admin'].includes(user?.role || '');
  const ownAmbulance = userScope(user?.ambulanceId);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest<Ambulance[]>('/ambulances');
      setFleet(Array.isArray(result) ? result : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load ambulance fleet.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function update(ambulance: Ambulance) {
    const status = nextStatus[ambulance._id];
    if (!status) return;
    setBusyId(ambulance._id);
    setError('');
    try {
      await apiRequest(`/ambulances/${ambulance._id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setNotice(`${ambulance.ambulanceId} updated to ${status.replaceAll('_', ' ')}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update ambulance status.');
    } finally {
      setBusyId('');
    }
  }

  async function createAmbulance(ambulanceId: string, baseHospitalId: string) {
    setCreateBusy(true);
    setError('');
    try {
      await apiRequest('/ambulances', {
        method: 'POST',
        body: JSON.stringify({ ambulanceId, baseHospitalId: baseHospitalId || undefined }),
      });
      setShowCreate(false);
      setNotice(`${ambulanceId} added to the fleet.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to add ambulance.');
    } finally {
      setCreateBusy(false);
    }
  }

  if (loading) return <LoadingState label="Loading ambulance fleet…" />;
  const visibleFleet = user?.role === 'ambulance_staff'
    ? fleet.filter((vehicle) => [vehicle._id, vehicle.ambulanceId].includes(ownAmbulance))
    : fleet;

  return <div className="page-stack">
    <div className="page-heading"><div><div className="eyebrow">TRANSPORT OPERATIONS</div><h1>Ambulance fleet</h1><p>View vehicle readiness and update journey status for authorized teams.</p></div><div className="heading-actions"><span className="toolbar-count">{visibleFleet.length} vehicles</span>{['coordinator', 'system_admin'].includes(user?.role || '') && <button className="button button-primary" onClick={() => setShowCreate(true)}><Plus size={17} /> Add vehicle</button>}</div></div>
    {error && <ErrorState message={error} />}
    {notice && <div className="notice-banner" role="status">{notice}<button aria-label="Dismiss" onClick={() => setNotice('')}>×</button></div>}
    <section className="fleet-grid">
      {visibleFleet.map((vehicle) => {
        const availableTransitions = transitions[vehicle.status] || [];
        return <article className="fleet-card" key={vehicle._id}>
          <div className="fleet-card-top"><span className="fleet-icon"><AmbulanceIcon size={19} /></span><StatePill value={vehicle.status} /></div>
          <h2>{vehicle.ambulanceId}</h2>
          <p className="fleet-base"><MapPin size={14} /> {userScope(vehicle.baseHospitalId) || 'Base hospital not specified'}</p>
          {canUpdate && availableTransitions.length > 0 && <div className="fleet-controls">
            <label className="sr-only" htmlFor={`status-${vehicle._id}`}>Set next status for {vehicle.ambulanceId}</label>
            <select id={`status-${vehicle._id}`} className="select" value={nextStatus[vehicle._id] || ''} onChange={(event) => setNextStatus((prev) => ({ ...prev, [vehicle._id]: event.target.value }))}>
              <option value="">Next status…</option>{availableTransitions.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
            </select>
            <button className="button button-secondary button-small" disabled={!nextStatus[vehicle._id] || busyId === vehicle._id} onClick={() => void update(vehicle)}><Save size={15} /> Update</button>
          </div>}
        </article>;
      })}
      {!visibleFleet.length && <div className="empty-state panel-card">No ambulance records are visible for this account.</div>}
    </section>
    <div className="info-banner">Status changes are checked by the backend against workflow transitions and account scope.</div>
    {showCreate && <CreateAmbulanceDialog busy={createBusy} onClose={() => setShowCreate(false)} onSubmit={(id, hospitalId) => void createAmbulance(id, hospitalId)} />}
  </div>;
}

function CreateAmbulanceDialog({ busy, onClose, onSubmit }: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (ambulanceId: string, baseHospitalId: string) => void;
}) {
  const [ambulanceId, setAmbulanceId] = useState('');
  const [baseHospitalId, setBaseHospitalId] = useState('');
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loadingHospitals, setLoadingHospitals] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest<Hospital[]>('/hospitals')
      .then((result) => setHospitals(Array.isArray(result) ? result : []))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Unable to load base hospitals.'))
      .finally(() => setLoadingHospitals(false));
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(ambulanceId.trim(), baseHospitalId);
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="modal-card form-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="create-ambulance-title">
      <div className="modal-heading"><div><div className="eyebrow">TRANSPORT OPERATIONS</div><h2 id="create-ambulance-title">Add fleet vehicle</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
      <p className="modal-copy">The vehicle will be registered as available. Assignments remain subject to case destination confirmation.</p>
      <label className="field-label" htmlFor="ambulance-id">Vehicle ID</label><input className="input" id="ambulance-id" required minLength={2} maxLength={40} value={ambulanceId} onChange={(event) => setAmbulanceId(event.target.value)} placeholder="e.g. AMB-05" />
      <label className="field-label" htmlFor="ambulance-base">Base hospital (optional)</label><select className="select" id="ambulance-base" disabled={loadingHospitals} value={baseHospitalId} onChange={(event) => setBaseHospitalId(event.target.value)}><option value="">{loadingHospitals ? 'Loading hospitals…' : 'No base hospital'}</option>{hospitals.map((hospital) => <option key={hospital._id} value={hospital._id}>{hospital.name}</option>)}</select>
      {error && <div className="form-alert" role="alert">{error}</div>}
      <div className="modal-actions"><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={busy || loadingHospitals}>{busy ? 'Saving…' : 'Add vehicle'} <Plus size={15} /></button></div>
    </form>
  </div>;
}
