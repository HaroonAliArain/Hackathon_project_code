import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Check, Edit3, MapPin, Plus, Save, X } from 'lucide-react';
import { apiRequest } from '../shared/api';
import { useAuth } from '../shared/AuthProvider';
import { humanize } from '../shared/format';
import type { Hospital } from '../shared/types';
import StatePill from '../components/StatePill';
import { ErrorState, LoadingState } from '../components/LoadState';

const RESOURCE_TYPES = [
  'icu_bed', 'er_bed', 'ventilator', 'cardiologist_on_call', 'trauma_team',
  'ct_scanner', 'blood_bank', 'general_bed', 'neurologist_on_call', 'orthopedic_surgeon',
];

interface ResourceValue {
  resourceType?: string;
  availableCount?: number | null;
  totalCapacity?: number | null;
  status?: string;
  ageMinutes?: number | null;
  verifiedAt?: string | null;
}

type HospitalDetail = Hospital & { resources?: Record<string, ResourceValue> };

function getId(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && '_id' in value) return String((value as { _id: unknown })._id);
  return '';
}

export default function HospitalsPage() {
  const { user } = useAuth();
  const [hospitals, setHospitals] = useState<HospitalDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<HospitalDetail | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest<HospitalDetail[]>('/hospitals');
      setHospitals(Array.isArray(result) ? result : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load hospitals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const roleCanEdit = ['hospital_staff', 'hospital_admin', 'system_admin'].includes(user?.role || '');
  const scopedHospital = user?.role === 'hospital_staff' || user?.role === 'hospital_admin'
    ? getId(user.hospitalId)
    : '';
  const visibleHospitals = hospitals.filter((hospital) => !scopedHospital || hospital._id === scopedHospital);

  async function openResources(hospital: HospitalDetail) {
    try {
      const result = await apiRequest<{ resources?: Record<string, ResourceValue> }>(`/hospitals/${hospital._id}/resources`);
      setSelected({ ...hospital, resources: result.resources || hospital.resources || {} });
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load hospital resource details.');
    }
  }

  async function confirmResources(hospitalId: string) {
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/hospitals/${hospitalId}/resources/confirm`, { method: 'POST' });
      setNotice('Resource figures were submitted for verification.');
      await load();
      setSelected(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to confirm resource figures.');
    } finally {
      setBusy(false);
    }
  }

  async function saveResource(hospitalId: string, resourceType: string, count: number | null, capacity: number | null) {
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/hospitals/${hospitalId}/resources`, {
        method: 'PUT',
        body: JSON.stringify({ updates: [{ resourceType, availableCount: count, totalCapacity: capacity }], verified: false }),
      });
      setNotice(`${humanize(resourceType)} update saved.`);
      await load();
      await openResources({ ...selected!, _id: hospitalId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update resources.');
    } finally {
      setBusy(false);
    }
  }

  async function createHospital(payload: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      await apiRequest('/hospitals', { method: 'POST', body: JSON.stringify(payload) });
      setShowCreate(false);
      setNotice('Hospital added to the facility network. Add current resource figures from its resource details.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to add the hospital.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Loading hospital network…" />;

  return <div className="page-stack">
    <div className="page-heading"><div><div className="eyebrow">FACILITY NETWORK</div><h1>Hospitals & resources</h1><p>Review operational capacity and how recently each figure was reported.</p></div>{user?.role === 'system_admin' && <button className="button button-primary" onClick={() => setShowCreate(true)}><Plus size={17} /> Add hospital</button>}</div>
    {error && <ErrorState message={error} />}
    {notice && <div className="notice-banner" role="status">{notice}<button aria-label="Dismiss" onClick={() => setNotice('')}><X size={16} /></button></div>}
    <section className="hospital-grid">
      {visibleHospitals.map((hospital) => {
        const freshness = hospital.freshnessSummary || {};
        const confirmed = freshness.confirmed || 0;
        const stale = freshness.stale || 0;
        const scopeMatch = !scopedHospital || hospital._id === scopedHospital;
        return <article className="hospital-card" key={hospital._id}>
          <div className="hospital-card-heading"><span className="hospital-icon"><MapPin size={18} /></span><StatePill value={hospital.status} /></div>
          <h2>{hospital.name}</h2>
          <p className="hospital-address">{hospital.location?.address || 'Location details unavailable'}</p>
          <div className="hospital-data-summary">
            <span><strong>{confirmed}</strong> confirmed data</span>
            <span><strong className={stale ? 'text-warning' : ''}>{stale}</strong> stale</span>
          </div>
          <div className="hospital-card-actions">
            <button className="button button-secondary button-small" onClick={() => void openResources(hospital)}>View resources</button>
            {roleCanEdit && scopeMatch && <button className="icon-button" title="Edit resource details" onClick={() => void openResources(hospital)}><Edit3 size={16} /></button>}
          </div>
        </article>;
      })}
      {!visibleHospitals.length && <div className="empty-state panel-card">No hospital records are available for your account.</div>}
    </section>
    {selected && <ResourceDialog hospital={selected} editable={roleCanEdit} busy={busy} onClose={() => setSelected(null)} onConfirm={() => void confirmResources(selected._id)} onSave={(type, count, capacity) => void saveResource(selected._id, type, count, capacity)} />}
    {showCreate && <CreateHospitalDialog busy={busy} onClose={() => setShowCreate(false)} onSubmit={(payload) => void createHospital(payload)} />}
  </div>;
}

function ResourceDialog({ hospital, editable, busy, onClose, onConfirm, onSave }: {
  hospital: HospitalDetail;
  editable: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onSave: (resourceType: string, count: number | null, capacity: number | null) => void;
}) {
  const entries = Object.entries(hospital.resources || {});
  const existingTypes = new Set(entries.map(([type]) => type));
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal-card resource-modal" role="dialog" aria-modal="true" aria-labelledby="resource-title">
      <div className="modal-heading"><div><div className="eyebrow">RESOURCE STATUS</div><h2 id="resource-title">{hospital.name}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
      <div className="resource-list">
        {entries.map(([type, resource]) => <ResourceRow key={type} type={type} resource={resource} editable={editable} busy={busy} onSave={onSave} />)}
        {!entries.length && <div className="empty-state">Resource details are unavailable.</div>}
      </div>
      {editable && <AddResourceForm existingTypes={existingTypes} busy={busy} onSave={onSave} />}
      {editable && <div className="modal-actions"><button className="button button-secondary" onClick={onClose}>Close</button><button className="button button-primary" disabled={busy} onClick={onConfirm}><Check size={16} /> Confirm current figures</button></div>}
    </section>
  </div>;
}

function AddResourceForm({ existingTypes, busy, onSave }: {
  existingTypes: Set<string>;
  busy: boolean;
  onSave: (resourceType: string, count: number | null, capacity: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('');
  const [count, setCount] = useState('');
  const [capacity, setCapacity] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!type) return;
    onSave(type, count === '' ? null : Number(count), capacity === '' ? null : Number(capacity));
    setOpen(false);
    setType('');
    setCount('');
    setCapacity('');
  }

  if (!open) return <button className="button button-secondary button-small add-resource-button" onClick={() => setOpen(true)}><Plus size={14} /> Add resource report</button>;
  return <form className="add-resource-form" onSubmit={submit}>
    <label className="field-label" htmlFor="new-resource-type">Resource type</label>
    <select className="select" id="new-resource-type" required value={type} onChange={(event) => setType(event.target.value)}>
      <option value="">Select a resource</option>
      {RESOURCE_TYPES.filter((item) => !existingTypes.has(item)).map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
      {RESOURCE_TYPES.filter((item) => existingTypes.has(item)).map((item) => <option key={item} value={item}>{humanize(item)} (new report)</option>)}
    </select>
    <div className="form-row"><div><label className="field-label" htmlFor="new-resource-count">Available count</label><input className="input" id="new-resource-count" type="number" min="0" value={count} onChange={(event) => setCount(event.target.value)} placeholder="Unknown" /></div><div><label className="field-label" htmlFor="new-resource-capacity">Total capacity</label><input className="input" id="new-resource-capacity" type="number" min="0" value={capacity} onChange={(event) => setCapacity(event.target.value)} placeholder="Optional" /></div></div>
    <div className="resource-form-actions"><button type="button" className="button button-quiet button-small" onClick={() => setOpen(false)}>Cancel</button><button type="submit" className="button button-primary button-small" disabled={busy || !type}><Save size={14} /> Save report</button></div>
  </form>;
}

function ResourceRow({ type, resource, editable, busy, onSave }: {
  type: string;
  resource: ResourceValue;
  editable: boolean;
  busy: boolean;
  onSave: (resourceType: string, count: number | null, capacity: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [count, setCount] = useState(resource.availableCount == null ? '' : String(resource.availableCount));
  const [capacity, setCapacity] = useState(resource.totalCapacity == null ? '' : String(resource.totalCapacity));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(type, count === '' ? null : Number(count), capacity === '' ? null : Number(capacity));
    setEditing(false);
  }

  return <article className="resource-row">
    <div className="resource-row-main"><strong>{humanize(type)}</strong><StatePill value={resource.status} /><span className="resource-count">{resource.availableCount == null ? 'Unknown' : `${resource.availableCount} available`}{resource.totalCapacity != null ? ` / ${resource.totalCapacity}` : ''}</span><small>{resource.ageMinutes == null ? 'No report' : `Reported ${resource.ageMinutes} min ago`}</small></div>
    {editable && (editing ? <form className="resource-edit-form" onSubmit={submit}><label className="sr-only" htmlFor={`count-${type}`}>Available count</label><input id={`count-${type}`} className="input input-compact" type="number" min="0" value={count} onChange={(event) => setCount(event.target.value)} placeholder="Available" /><label className="sr-only" htmlFor={`capacity-${type}`}>Total capacity</label><input id={`capacity-${type}`} className="input input-compact" type="number" min="0" value={capacity} onChange={(event) => setCapacity(event.target.value)} placeholder="Total" /><button className="icon-button" disabled={busy} type="submit" aria-label={`Save ${humanize(type)}`}><Save size={16} /></button><button className="icon-button" type="button" onClick={() => setEditing(false)} aria-label="Cancel edit"><X size={16} /></button></form> : <button className="button button-quiet button-small" onClick={() => setEditing(true)}>Update</button>)}
  </article>;
}

function CreateHospitalDialog({ busy, onClose, onSubmit }: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [phone, setPhone] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [status, setStatus] = useState('active');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      name: name.trim(),
      location: { address: address.trim(), lat: Number(lat), lng: Number(lng) },
      contactPhone: phone.trim() || undefined,
      specialties: specialties.split(',').map((item) => item.trim()).filter(Boolean),
      status,
    });
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="modal-card form-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="create-hospital-title">
      <div className="modal-heading"><div><div className="eyebrow">FACILITY NETWORK</div><h2 id="create-hospital-title">Add hospital</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
      <label className="field-label" htmlFor="hospital-name">Hospital name</label><input className="input" id="hospital-name" required minLength={2} maxLength={160} value={name} onChange={(event) => setName(event.target.value)} />
      <label className="field-label" htmlFor="hospital-address">Address</label><input className="input" id="hospital-address" required minLength={2} maxLength={300} value={address} onChange={(event) => setAddress(event.target.value)} />
      <div className="form-row"><div><label className="field-label" htmlFor="hospital-lat">Latitude</label><input className="input" id="hospital-lat" type="number" min="-90" max="90" step="any" required value={lat} onChange={(event) => setLat(event.target.value)} /></div><div><label className="field-label" htmlFor="hospital-lng">Longitude</label><input className="input" id="hospital-lng" type="number" min="-180" max="180" step="any" required value={lng} onChange={(event) => setLng(event.target.value)} /></div></div>
      <label className="field-label" htmlFor="hospital-phone">Contact phone (optional)</label><input className="input" id="hospital-phone" type="tel" maxLength={40} value={phone} onChange={(event) => setPhone(event.target.value)} />
      <label className="field-label" htmlFor="hospital-specialties">Specialties (comma separated)</label><input className="input" id="hospital-specialties" value={specialties} onChange={(event) => setSpecialties(event.target.value)} placeholder="Cardiology, trauma" />
      <label className="field-label" htmlFor="hospital-status">Facility status</label><select className="select" id="hospital-status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">Active</option><option value="diverted">Diverted</option><option value="closed">Closed</option></select>
      <div className="modal-actions"><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add hospital'} <Plus size={15} /></button></div>
    </form>
  </div>;
}
