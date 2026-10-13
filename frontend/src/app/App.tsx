import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '../shared/AuthProvider';
import type { Role } from '../shared/types';
import AppShell from '../components/AppShell';
import { LoadingState } from '../components/LoadState';
import AmbulancesPage from '../pages/AmbulancesPage';
import DashboardPage from '../pages/DashboardPage';
import EmergenciesPage from '../pages/EmergenciesPage';
import HospitalsPage from '../pages/HospitalsPage';
import LoginPage from '../pages/LoginPage';
import ReferralsPage from '../pages/ReferralsPage';
import RegisterUserPage from '../pages/RegisterUserPage';
import TeamPage from '../pages/TeamPage';

function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingState label="Checking secure session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <AppShell />;
}

function AllowRoles({ roles }: { roles: Role[] }) {
  const { user } = useAuth();
  return user && roles.includes(user.role) ? <Outlet /> : <Navigate to="/" replace />;
}

export default function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<RequireAuth />}>
      <Route index element={<DashboardPage />} />
      <Route path="emergencies" element={<EmergenciesPage />} />
      <Route path="hospitals" element={<HospitalsPage />} />
      <Route element={<AllowRoles roles={['coordinator', 'system_admin', 'observer', 'hospital_staff', 'hospital_admin']} />}>
        <Route path="referrals" element={<ReferralsPage />} />
      </Route>
      <Route element={<AllowRoles roles={['coordinator', 'system_admin', 'observer', 'ambulance_staff']} />}>
        <Route path="ambulances" element={<AmbulancesPage />} />
      </Route>
      <Route element={<AllowRoles roles={['system_admin', 'hospital_admin']} />}>
        <Route path="team/new" element={<RegisterUserPage />} />
        <Route path="team" element={<TeamPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>;
}
