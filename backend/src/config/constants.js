const ROLES = ['coordinator', 'ambulance_staff', 'hospital_staff', 'hospital_admin', 'system_admin', 'observer'];

const EMERGENCY_STATUSES = [
  'registered',
  'referral_pending',
  'destination_confirmed',
  'ambulance_assigned',
  'en_route',
  'arrived',
  'handed_over',
  'closed',
  'cancelled'
];

const VALID_EMERGENCY_TRANSITIONS = {
  registered: ['referral_pending', 'cancelled'],
  referral_pending: ['destination_confirmed', 'registered', 'cancelled'],
  destination_confirmed: ['ambulance_assigned', 'cancelled'],
  ambulance_assigned: ['en_route', 'cancelled'],
  en_route: ['arrived', 'cancelled'],
  arrived: ['handed_over'],
  handed_over: ['closed'],
  closed: [],
  cancelled: []
};

const PRIORITY_CATEGORIES = ['critical', 'urgent', 'standard'];

const REFERRAL_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'clarification_requested',
  'expired',
  'escalated'
];

const AMBULANCE_STATUSES = ['available', 'assigned', 'en_route', 'arrived', 'unavailable'];

const VALID_AMBULANCE_TRANSITIONS = {
  available: ['assigned', 'unavailable'],
  assigned: ['en_route', 'available', 'unavailable'],
  en_route: ['arrived', 'unavailable'],
  arrived: ['available', 'unavailable'],
  unavailable: ['available']
};

const ASSIGNMENT_STATUSES = ['assigned', 'en_route', 'arrived', 'handed_over'];

const VALID_ASSIGNMENT_TRANSITIONS = {
  assigned: ['en_route'],
  en_route: ['arrived'],
  arrived: ['handed_over'],
  handed_over: []
};

const HOSPITAL_STATUSES = ['active', 'closed', 'diverted'];

const RESOURCE_TYPES = [
  'icu_bed',
  'er_bed',
  'ventilator',
  'cardiologist_on_call',
  'trauma_team',
  'ct_scanner',
  'blood_bank',
  'general_bed',
  'neurologist_on_call',
  'orthopedic_surgeon'
];

const FRESHNESS_STATUSES = ['confirmed', 'unconfirmed', 'stale', 'unknown', 'unavailable'];

const ACCOUNT_STATUSES = ['active', 'disabled'];

const SYNC_STATUSES = ['applied', 'duplicate', 'rejected', 'conflict'];
const CONFLICT_STATUSES = ['none', 'needs_review', 'resolved'];

const AUDIT_EVENT_TYPES = [
  'login',
  'login_failed',
  'emergency_created',
  'emergency_status_changed',
  'resource_updated',
  'resource_verified',
  'recommendation_requested',
  'referral_requested',
  'referral_responded',
  'referral_escalated',
  'ambulance_assigned',
  'ambulance_status_changed',
  'assignment_created',
  'assignment_status_changed',
  'sync_conflict_created',
  'sync_conflict_resolved',
  'user_created',
  'user_updated',
  'hospital_created',
  'ambulance_created'
];

const RECOMMENDATION_WEIGHTS = {
  travel: 0.40,
  freshness: 0.30,
  capacity: 0.20,
  capability: 0.10
};

module.exports = {
  ROLES,
  EMERGENCY_STATUSES,
  VALID_EMERGENCY_TRANSITIONS,
  PRIORITY_CATEGORIES,
  REFERRAL_STATUSES,
  AMBULANCE_STATUSES,
  VALID_AMBULANCE_TRANSITIONS,
  ASSIGNMENT_STATUSES,
  VALID_ASSIGNMENT_TRANSITIONS,
  HOSPITAL_STATUSES,
  RESOURCE_TYPES,
  FRESHNESS_STATUSES,
  ACCOUNT_STATUSES,
  SYNC_STATUSES,
  CONFLICT_STATUSES,
  AUDIT_EVENT_TYPES,
  RECOMMENDATION_WEIGHTS
};
