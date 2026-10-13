const emergencyService = require('../../src/services/emergency.service');
const { recommend } = require('../../src/services/recommendation.engine');
const referralService = require('../../src/services/referral.service');
const assignmentService = require('../../src/services/assignment.service');
const emailService = require('../../src/services/email.service');

const Emergency = require('../../src/models/Emergency');
const Hospital = require('../../src/models/Hospital');
const Ambulance = require('../../src/models/Ambulance');
const User = require('../../src/models/User');
const Referral = require('../../src/models/Referral');
const Assignment = require('../../src/models/Assignment');

jest.mock('../../src/models/Emergency');
jest.mock('../../src/models/Hospital');
jest.mock('../../src/models/Ambulance');
jest.mock('../../src/models/User');
jest.mock('../../src/models/Referral');
jest.mock('../../src/models/Assignment');
jest.mock('../../src/services/email.service', () => ({
  sendReferralAccepted: jest.fn().mockResolvedValue({ messageId: 'email-1' }),
  sendReferralDecision: jest.fn().mockResolvedValue({ messageId: 'email-1' }),
  sendAssignmentUpdate: jest.fn().mockResolvedValue([]),
  sendStaleResourceReminder: jest.fn().mockResolvedValue({ messageId: 'email-1' })
}));
jest.mock('../../src/middleware/audit', () => ({
  createAuditEvent: jest.fn(),
  sanitizeData: jest.fn((d) => d)
}));
jest.mock('../../src/sockets/emitter', () => ({
  emitEmergencyCreated: jest.fn(),
  emitEmergencyStatusUpdated: jest.fn(),
  emitReferralRequested: jest.fn(),
  emitReferralResponded: jest.fn(),
  emitAmbulanceStatusUpdated: jest.fn(),
  emitAssignmentCreated: jest.fn(),
  emitAssignmentStatusUpdated: jest.fn()
}));

describe('End-to-End Emergency Workflow Happy Path Test', () => {
  // Mock entity IDs
  const caseId = 'EL-20261013-0001';
  const emergencyId = '64f1a2b3c4d5e6f7a8b9c001';
  const hospitalId = '64f1a2b3c4d5e6f7a8b9c101';
  const ambulanceId = '64f1a2b3c4d5e6f7a8b9c201';
  const referralId = '64f1a2b3c4d5e6f7a8b9c301';
  const assignmentId = '64f1a2b3c4d5e6f7a8b9c401';

  // Actor profiles
  const coordinatorUser = {
    _id: 'user-coordinator',
    id: 'user-coordinator',
    role: 'coordinator',
    name: 'Ops Coordinator'
  };

  const hospitalStaffUser = {
    _id: 'user-hospital',
    id: 'user-hospital',
    role: 'hospital_staff',
    hospitalId,
    name: 'ER Nurse'
  };

  const ambulanceStaffUser = {
    _id: 'user-ambulance',
    id: 'user-ambulance',
    role: 'ambulance_staff',
    ambulanceId,
    name: 'Paramedic Lead'
  };

  // State containers simulating MongoDB documents in memory
  let stateEmergency;
  let stateHospital;
  let stateAmbulance;
  let stateReferral;
  let stateAssignment;

  beforeEach(() => {
    jest.clearAllMocks();
    User.find = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue([])
    });

    stateEmergency = {
      _id: emergencyId,
      caseId,
      status: 'registered',
      priorityCategory: 'critical',
      requiredResources: [{ resourceType: 'icu_bed', minCount: 1 }],
      requiredSpecialties: ['cardiology'],
      pickupLocation: { lat: 12.9716, lng: 77.5946 },
      confirmedHospitalId: null,
      version: 1,
      save: jest.fn().mockResolvedValue(true)
    };

    stateHospital = {
      _id: hospitalId,
      name: 'City Care Hospital',
      status: 'active',
      specialties: ['cardiology'],
      resources: [
        { resourceType: 'icu_bed', availableCount: 5, totalCapacity: 10, status: 'confirmed' }
      ]
    };

    stateAmbulance = {
      _id: ambulanceId,
      ambulanceId: 'AMB-101',
      status: 'available',
      baseHospitalId: hospitalId,
      lastKnownLocation: { lat: 12.97, lng: 77.59 },
      version: 1,
      save: jest.fn().mockResolvedValue(true)
    };

    stateReferral = null;
    stateAssignment = null;

    // Emergency model mocks
    Emergency.generateCaseId = jest.fn().mockResolvedValue(caseId);
    Emergency.create = jest.fn().mockImplementation((data) => {
      stateEmergency = { ...stateEmergency, ...data, caseId: data.caseId || caseId, save: jest.fn().mockResolvedValue(true) };
      return Promise.resolve(stateEmergency);
    });
    Emergency.findOne = jest.fn().mockImplementation(() => Promise.resolve(stateEmergency));
    Emergency.findById = jest.fn().mockImplementation(() => Promise.resolve(stateEmergency));
    Emergency.findOneAndUpdate = jest.fn().mockImplementation((filter, update) => {
      if (update.$set) Object.assign(stateEmergency, update.$set);
      if (update.$inc && update.$inc.version) stateEmergency.version += update.$inc.version;
      return Promise.resolve(stateEmergency);
    });

    // Hospital model mocks
    Hospital.findById = jest.fn().mockImplementation(() => Promise.resolve(stateHospital));

    // Ambulance model mocks
    Ambulance.findOne = jest.fn().mockImplementation(() => Promise.resolve(stateAmbulance));
    Ambulance.findById = jest.fn().mockImplementation(() => Promise.resolve(stateAmbulance));
    Ambulance.findOneAndUpdate = jest.fn().mockImplementation((filter, update) => {
      if (update.$set) Object.assign(stateAmbulance, update.$set);
      if (update.$inc && update.$inc.version) stateAmbulance.version += update.$inc.version;
      return Promise.resolve(stateAmbulance);
    });
    Ambulance.findByIdAndUpdate = jest.fn().mockImplementation((id, update) => {
      if (update.$set) Object.assign(stateAmbulance, update.$set);
      if (update.$inc && update.$inc.version) stateAmbulance.version += update.$inc.version;
      return Promise.resolve(stateAmbulance);
    });

    // Referral model mocks
    Referral.create = jest.fn().mockImplementation((data) => {
      stateReferral = {
        _id: referralId,
        requestStatus: 'pending',
        ...data,
        version: 1,
        save: jest.fn().mockResolvedValue(true)
      };
      return Promise.resolve(stateReferral);
    });
    const referralQuery = {
      populate: jest.fn().mockImplementation(() => referralQuery),
      then: (resolve, reject) => Promise.resolve(stateReferral).then(resolve, reject)
    };
    Referral.findById = jest.fn().mockImplementation(() => referralQuery);
    Referral.findOne = jest.fn().mockImplementation((filter) => {
      if (filter && filter.requestStatus === 'accepted') {
        return Promise.resolve(null);
      }
      return referralQuery;
    });
    Referral.find = jest.fn().mockImplementation(() => ({
      select: jest.fn().mockResolvedValue([]),
      populate: jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue([])
      })
    }));
    Referral.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 0 });
    Referral.countDocuments = jest.fn().mockResolvedValue(1);

    // Assignment model mocks
    Assignment.create = jest.fn().mockImplementation((data) => {
      stateAssignment = {
        _id: assignmentId,
        status: 'assigned',
        timestamps: { assignedAt: new Date() },
        ...data,
        save: jest.fn().mockResolvedValue(true)
      };
      return Promise.resolve(stateAssignment);
    });
    const assignmentQuery = {
      populate: jest.fn().mockImplementation(() => assignmentQuery),
      then: (resolve, reject) => Promise.resolve(stateAssignment).then(resolve, reject)
    };
    Assignment.findById = jest.fn().mockImplementation(() => assignmentQuery);
    Assignment.findOne = jest.fn().mockImplementation(() => assignmentQuery);
  });

  test('keeps an accepted referral successful when its notification email cannot be delivered', async () => {
    await referralService.create({ caseId, hospitalId }, coordinatorUser);
    emailService.sendReferralDecision.mockRejectedValueOnce(new Error('SMTP unavailable'));
    const logError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const acceptedReferral = await referralService.respond(
        referralId,
        { decision: 'accepted', note: 'Destination confirmed' },
        hospitalStaffUser
      );

      expect(acceptedReferral.requestStatus).toBe('accepted');
      expect(stateEmergency.status).toBe('destination_confirmed');
      expect(logError).toHaveBeenCalledWith(
        '[EmailNotification] Referral response was saved, but requester email delivery failed.',
        expect.objectContaining({ referralId, requestStatus: 'accepted', error: 'SMTP unavailable' })
      );
    } finally {
      logError.mockRestore();
    }
  });

  test('emails the original requester when a hospital rejects a referral', async () => {
    await referralService.create({ caseId, hospitalId }, coordinatorUser);

    const rejectedReferral = await referralService.respond(
      referralId,
      { decision: 'rejected', note: 'No capacity' },
      hospitalStaffUser
    );

    expect(rejectedReferral.requestStatus).toBe('rejected');
    expect(emailService.sendReferralDecision).toHaveBeenCalledWith(rejectedReferral);
  });

  test('emails the original requester when a hospital requests clarification', async () => {
    await referralService.create({ caseId, hospitalId }, coordinatorUser);

    const clarificationReferral = await referralService.respond(
      referralId,
      { decision: 'clarification_requested', note: 'Please confirm required resources' },
      hospitalStaffUser
    );

    expect(clarificationReferral.requestStatus).toBe('clarification_requested');
    expect(emailService.sendReferralDecision).toHaveBeenCalledWith(clarificationReferral);
  });

  test('keeps an ambulance assignment successful when its notification email cannot be delivered', async () => {
    stateEmergency.status = 'destination_confirmed';
    stateEmergency.confirmedHospitalId = hospitalId;
    emailService.sendAssignmentUpdate.mockRejectedValueOnce(new Error('SMTP unavailable'));
    const logError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const createdAssignment = await assignmentService.create(
        { caseId, ambulanceId },
        coordinatorUser
      );

      expect(createdAssignment.status).toBe('assigned');
      expect(stateEmergency.status).toBe('ambulance_assigned');
      expect(logError).toHaveBeenCalledWith(
        '[EmailNotification] Assignment was saved, but assignment email delivery failed.',
        expect.objectContaining({ assignmentId, status: 'assigned', error: 'SMTP unavailable' })
      );
    } finally {
      logError.mockRestore();
    }
  });

  test('executes end-to-end emergency lifecycle successfully from registration to handover', async () => {
    // -------------------------------------------------------------------------
    // Step 1: Register Emergency
    // -------------------------------------------------------------------------
    const registeredEmergency = await emergencyService.create(
      {
        priorityCategory: 'critical',
        pickupLocation: { lat: 12.9716, lng: 77.5946 },
        requiredResources: [{ resourceType: 'icu_bed', minCount: 1 }],
        requiredSpecialties: ['cardiology']
      },
      coordinatorUser
    );

    expect(registeredEmergency.status).toBe('registered');
    expect(registeredEmergency.caseId).toBeDefined();

    // -------------------------------------------------------------------------
    // Step 2: Request Recommendations
    // -------------------------------------------------------------------------
    const recommendationResult = recommend({
      case: {
        pickupLocation: registeredEmergency.pickupLocation,
        requiredResources: registeredEmergency.requiredResources,
        requiredSpecialties: registeredEmergency.requiredSpecialties
      },
      hospitals: [
        {
          hospitalId,
          name: stateHospital.name,
          status: stateHospital.status,
          etaMinutes: 12,
          specialties: stateHospital.specialties,
          resources: stateHospital.resources
        }
      ]
    });

    expect(recommendationResult.eligible).toHaveLength(1);
    expect(recommendationResult.eligible[0].hospitalId).toBe(hospitalId);
    expect(recommendationResult.eligible[0].score).toBeGreaterThan(0);

    // -------------------------------------------------------------------------
    // Step 3: Create Referral
    // -------------------------------------------------------------------------
    const createdReferral = await referralService.create(
      {
        caseId: registeredEmergency.caseId,
        hospitalId
      },
      coordinatorUser
    );

    expect(createdReferral.requestStatus).toBe('pending');
    expect(stateEmergency.status).toBe('referral_pending');

    // -------------------------------------------------------------------------
    // Step 4: Accept Referral by Hospital Staff
    // -------------------------------------------------------------------------
    const acceptedReferral = await referralService.respond(
      referralId,
      {
        status: 'accepted',
        responseNote: 'Bed reserved in ICU Unit 1'
      },
      hospitalStaffUser
    );

    expect(acceptedReferral.requestStatus).toBe('accepted');
    expect(emailService.sendReferralDecision).toHaveBeenCalledTimes(1);
    expect(emailService.sendReferralDecision).toHaveBeenCalledWith(acceptedReferral);
    expect(stateEmergency.status).toBe('destination_confirmed');
    expect(stateEmergency.confirmedHospitalId.toString()).toBe(hospitalId);

    // -------------------------------------------------------------------------
    // Step 5: Assign Ambulance
    // -------------------------------------------------------------------------
    const createdAssignment = await assignmentService.create(
      {
        caseId: registeredEmergency.caseId,
        ambulanceId
      },
      coordinatorUser
    );

    expect(createdAssignment.status).toBe('assigned');
    expect(stateEmergency.status).toBe('ambulance_assigned');
    expect(stateAmbulance.status).toBe('assigned');

    // -------------------------------------------------------------------------
    // Step 6: Journey Update 1 - En Route
    // -------------------------------------------------------------------------
    const enRouteAssignment = await assignmentService.updateStatus(
      assignmentId,
      { status: 'en_route' },
      ambulanceStaffUser
    );

    expect(enRouteAssignment.status).toBe('en_route');
    expect(stateEmergency.status).toBe('en_route');
    expect(stateAmbulance.status).toBe('en_route');

    // -------------------------------------------------------------------------
    // Step 7: Journey Update 2 - Arrived at Hospital
    // -------------------------------------------------------------------------
    const arrivedAssignment = await assignmentService.updateStatus(
      assignmentId,
      { status: 'arrived' },
      ambulanceStaffUser
    );

    expect(arrivedAssignment.status).toBe('arrived');
    expect(stateEmergency.status).toBe('arrived');
    expect(stateAmbulance.status).toBe('arrived');

    // -------------------------------------------------------------------------
    // Step 8: Patient Handover at Hospital
    // -------------------------------------------------------------------------
    const handedOverAssignment = await assignmentService.updateStatus(
      assignmentId,
      { status: 'handed_over' },
      hospitalStaffUser
    );

    expect(handedOverAssignment.status).toBe('handed_over');
    expect(stateEmergency.status).toBe('handed_over');
    expect(stateAmbulance.status).toBe('available'); // Ambulance frees up for next dispatch
    expect(emailService.sendAssignmentUpdate).toHaveBeenCalledTimes(4);
  });
});
