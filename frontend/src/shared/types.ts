export type Role =
  | 'coordinator'
  | 'ambulance_staff'
  | 'hospital_staff'
  | 'hospital_admin'
  | 'system_admin'
  | 'observer';

export interface User {
  _id?: string;
  id?: string;
  name: string;
  email: string;
  role: Role;
  hospitalId?: string | { _id?: string; name?: string } | null;
  ambulanceId?: string | { _id?: string; ambulanceId?: string } | null;
  accountStatus?: 'active' | 'disabled';
}

export interface Emergency {
  _id: string;
  caseId: string;
  summary?: string;
  priorityCategory: string;
  status: string;
  createdAt?: string;
  confirmedHospitalId?: string | null;
}

export interface Hospital {
  _id: string;
  name: string;
  status: string;
  location?: { address?: string };
  freshnessSummary?: Record<string, number>;
}

export interface Referral {
  _id: string;
  caseId: string;
  requestStatus: string;
  hospitalId?: string | { _id?: string; name?: string };
  requestedAt?: string;
}

export interface Ambulance {
  _id: string;
  ambulanceId: string;
  status: string;
  baseHospitalId?: string | { name?: string };
}

export interface DashboardSummary {
  activeCases?: number;
  pendingReferrals?: number;
  ambulanceStatuses?: Record<string, number>;
  freshnessBreakdown?: Record<string, number>;
  recentEmergencies?: Emergency[];
}

export interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: Array<{ field?: string; message?: string }>;
}
