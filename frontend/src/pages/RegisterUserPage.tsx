import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, Check, UserPlus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../shared/api';
import { useAuth } from '../shared/AuthProvider';
import { humanize } from '../shared/format';
import type { Role } from '../shared/types';
import { ErrorState } from '../components/LoadState';

interface OrganizationOption {
  _id: string;
  name?: string;
  ambulanceId?: string;
}

export default function RegisterUserPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isSystemAdmin = user?.role === 'system_admin';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>(isSystemAdmin ? 'coordinator' : 'hospital_staff');
  const [hospitalId, setHospitalId] = useState('');
  const [ambulanceId, setAmbulanceId] = useState('');
  const [hospitals, setHospitals] = useState<OrganizationOption[]>([]);
  const [ambulances, setAmbulances] = useState<OrganizationOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(Boolean(isSystemAdmin));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isSystemAdmin) return;
    Promise.all([
      apiRequest<OrganizationOption[]>('/hospitals'),
      apiRequest<OrganizationOption[]>('/ambulances'),
    ])
      .then(([hospitalData, ambulanceData]) => {
        setHospitals(Array.isArray(hospitalData) ? hospitalData : []);
        setAmbulances(Array.isArray(ambulanceData) ? ambulanceData : []);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Unable to load organization options.');
      })
      .finally(() => setLoadingOptions(false));
  }, [isSystemAdmin]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiRequest('/users', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          hospitalId: isSystemAdmin && ['hospital_staff', 'hospital_admin'].includes(role)
            ? hospitalId || undefined
            : undefined,
          ambulanceId: isSystemAdmin && role === 'ambulance_staff'
            ? ambulanceId || undefined
            : undefined,
        }),
      });
      navigate('/team', { replace: true, state: { notice: `Account registered for ${email.trim()}.` } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to register user.');
    } finally {
      setSubmitting(false);
    }
  }

  const roles: Role[] = isSystemAdmin
    ? ['coordinator', 'ambulance_staff', 'hospital_staff', 'hospital_admin', 'system_admin', 'observer']
    : ['hospital_staff'];
  const needsHospital = isSystemAdmin && ['hospital_staff', 'hospital_admin'].includes(role);
  const needsAmbulance = isSystemAdmin && role === 'ambulance_staff';

  if (!user) return null;

  return <div className="page-stack">
    <div className="page-heading">
      <div><div className="eyebrow">ACCESS MANAGEMENT</div><h1>Register user</h1><p>Create a role-scoped account for a new team member.</p></div>
      <Link className="button button-secondary" to="/team"><ArrowLeft size={16} /> Back to team</Link>
    </div>
    {error && <ErrorState message={error} />}
    <form className="panel-card user-registration-card" onSubmit={submit}>
      <div className="registration-intro"><span className="hospital-icon"><UserPlus size={18} /></span><div><strong>Account details</strong><p>Permissions and organization scope are verified by the backend.</p></div></div>
      <div className="registration-fields">
        <div><label className="field-label" htmlFor="register-name">Full name</label><input id="register-name" className="input" required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></div>
        <div><label className="field-label" htmlFor="register-email">Email address</label><input id="register-email" className="input" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></div>
        <div><label className="field-label" htmlFor="register-password">Temporary password</label><input id="register-password" className="input" type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /><small className="field-hint">At least 6 characters. Share credentials securely.</small></div>
        <div><label className="field-label" htmlFor="register-role">Role</label><select id="register-role" className="select" value={role} onChange={(event) => setRole(event.target.value as Role)}>{roles.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</select>{!isSystemAdmin && <small className="field-hint">Hospital admins can register staff for their own hospital.</small>}</div>
        {needsHospital && <div><label className="field-label" htmlFor="register-hospital">Hospital</label><select id="register-hospital" className="select" required value={hospitalId} onChange={(event) => setHospitalId(event.target.value)} disabled={loadingOptions}><option value="">{loadingOptions ? 'Loading hospitals…' : 'Select hospital'}</option>{hospitals.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></div>}
        {needsAmbulance && <div><label className="field-label" htmlFor="register-ambulance">Ambulance</label><select id="register-ambulance" className="select" required value={ambulanceId} onChange={(event) => setAmbulanceId(event.target.value)} disabled={loadingOptions}><option value="">{loadingOptions ? 'Loading vehicles…' : 'Select ambulance'}</option>{ambulances.map((item) => <option key={item._id} value={item._id}>{item.ambulanceId}</option>)}</select></div>}
      </div>
      <div className="registration-footer"><span className="field-hint"><Check size={14} /> Passwords are sent only over the authenticated API and are never displayed after creation.</span><button className="button button-primary" type="submit" disabled={submitting || loadingOptions}>{submitting ? 'Registering…' : 'Register account'} <UserPlus size={16} /></button></div>
    </form>
    <div className="info-banner">A hospital administrator may create hospital staff for their assigned hospital only. Only system administrators can assign global roles and organization links.</div>
  </div>;
}
