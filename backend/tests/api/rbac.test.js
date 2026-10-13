const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const User = require('../../src/models/User');
const envConfig = require('../../src/config/env');
const resourceService = require('../../src/services/resource.service');
const ambulanceService = require('../../src/services/ambulance.service');
const emergencyService = require('../../src/services/emergency.service');

jest.mock('../../src/models/User');
jest.mock('../../src/services/resource.service');
jest.mock('../../src/services/ambulance.service');
jest.mock('../../src/services/emergency.service');
jest.mock('../../src/middleware/audit', () => ({
  createAuditEvent: jest.fn(),
  sanitizeData: jest.fn((d) => d)
}));

describe('RBAC & Scoping API Integration Tests', () => {
  const ownHospitalId = '64f1a2b3c4d5e6f7a8b9c101';
  const otherHospitalId = '64f1a2b3c4d5e6f7a8b9c102';

  const ownAmbulanceId = '64f1a2b3c4d5e6f7a8b9c201';
  const otherAmbulanceId = '64f1a2b3c4d5e6f7a8b9c202';

  const generateUserAndToken = (role, extra = {}) => {
    const id = `64f1a2b3c4d5e6f7a8b9c00${Math.floor(Math.random() * 9)}`;
    const userDoc = {
      _id: id,
      name: `${role} user`,
      email: `${role}@emergencylink.org`,
      role,
      accountStatus: 'active',
      isActive: true,
      hospitalId: extra.hospitalId || null,
      ambulanceId: extra.ambulanceId || null,
      ...extra
    };

    const token = jwt.sign(
      { id, role, hospitalId: userDoc.hospitalId, ambulanceId: userDoc.ambulanceId },
      envConfig.JWT_SECRET,
      { expiresIn: '1h' }
    );

    return { userDoc, token };
  };

  const setupUserMock = (userDoc) => {
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(userDoc)
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Role Permissions on POST /api/v1/emergencies', () => {
    test('coordinator is authorized to register an emergency (201)', async () => {
      const { userDoc, token } = generateUserAndToken('coordinator');
      setupUserMock(userDoc);
      emergencyService.create.mockResolvedValue({ _id: 'emg-1', caseId: 'EL-20261013-0001' });

      const res = await request(app)
        .post('/api/v1/emergencies')
        .set('Authorization', `Bearer ${token}`)
        .send({
          priorityCategory: 'critical',
          pickupLocation: { lat: 12.97, lng: 77.59 }
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    test('ambulance_staff is authorized to register an emergency (201)', async () => {
      const { userDoc, token } = generateUserAndToken('ambulance_staff', {
        ambulanceId: ownAmbulanceId
      });
      setupUserMock(userDoc);
      emergencyService.create.mockResolvedValue({ _id: 'emg-2', caseId: 'EL-20261013-0002' });

      const res = await request(app)
        .post('/api/v1/emergencies')
        .set('Authorization', `Bearer ${token}`)
        .send({
          priorityCategory: 'urgent',
          pickupLocation: { lat: 12.97, lng: 77.59 }
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    test('hospital_staff is forbidden from creating emergency directly (403)', async () => {
      const { userDoc, token } = generateUserAndToken('hospital_staff', {
        hospitalId: ownHospitalId
      });
      setupUserMock(userDoc);

      const res = await request(app)
        .post('/api/v1/emergencies')
        .set('Authorization', `Bearer ${token}`)
        .send({
          priorityCategory: 'urgent',
          pickupLocation: { lat: 12.97, lng: 77.59 }
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('observer is forbidden from creating emergency (403)', async () => {
      const { userDoc, token } = generateUserAndToken('observer');
      setupUserMock(userDoc);

      const res = await request(app)
        .post('/api/v1/emergencies')
        .set('Authorization', `Bearer ${token}`)
        .send({
          priorityCategory: 'standard',
          pickupLocation: { lat: 12.97, lng: 77.59 }
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Hospital Scoping on PUT /api/v1/hospitals/:id/resources', () => {
    test('hospital_staff can update resources of their OWN hospital (200)', async () => {
      const { userDoc, token } = generateUserAndToken('hospital_staff', {
        hospitalId: ownHospitalId
      });
      setupUserMock(userDoc);
      resourceService.updateResources.mockResolvedValue({ hospitalId: ownHospitalId, resources: {} });

      const res = await request(app)
        .put(`/api/v1/hospitals/${ownHospitalId}/resources`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          updates: [{ resourceType: 'icu_bed', availableCount: 4 }]
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('hospital_staff is FORBIDDEN from updating resources of ANOTHER hospital (403)', async () => {
      const { userDoc, token } = generateUserAndToken('hospital_staff', {
        hospitalId: ownHospitalId
      });
      setupUserMock(userDoc);

      const res = await request(app)
        .put(`/api/v1/hospitals/${otherHospitalId}/resources`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          updates: [{ resourceType: 'icu_bed', availableCount: 4 }]
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/own hospital/i);
    });

    test('system_admin can update resources of ANY hospital (200)', async () => {
      const { userDoc, token } = generateUserAndToken('system_admin');
      setupUserMock(userDoc);
      resourceService.updateResources.mockResolvedValue({ hospitalId: otherHospitalId, resources: {} });

      const res = await request(app)
        .put(`/api/v1/hospitals/${otherHospitalId}/resources`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          updates: [{ resourceType: 'icu_bed', availableCount: 2 }]
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Hospital registration on POST /api/v1/hospitals', () => {
    test('system_admin can create a hospital', async () => {
      const { userDoc, token } = generateUserAndToken('system_admin');
      setupUserMock(userDoc);
      resourceService.createHospital.mockResolvedValue({ _id: otherHospitalId, name: 'New Hospital' });

      const res = await request(app)
        .post('/api/v1/hospitals')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'New Hospital',
          location: { lat: 12.97, lng: 77.59, address: 'Demo address' }
        });

      expect(res.status).toBe(201);
      expect(resourceService.createHospital).toHaveBeenCalled();
    });

    test('coordinator cannot create a hospital', async () => {
      const { userDoc, token } = generateUserAndToken('coordinator');
      setupUserMock(userDoc);

      const res = await request(app)
        .post('/api/v1/hospitals')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'New Hospital',
          location: { lat: 12.97, lng: 77.59, address: 'Demo address' }
        });

      expect(res.status).toBe(403);
      expect(resourceService.createHospital).not.toHaveBeenCalled();
    });
  });

  describe('Ambulance registration on POST /api/v1/ambulances', () => {
    test('coordinator can create an ambulance', async () => {
      const { userDoc, token } = generateUserAndToken('coordinator');
      setupUserMock(userDoc);
      ambulanceService.create.mockResolvedValue({ _id: otherAmbulanceId, ambulanceId: 'AMB-NEW' });

      const res = await request(app)
        .post('/api/v1/ambulances')
        .set('Authorization', `Bearer ${token}`)
        .send({ ambulanceId: 'AMB-NEW' });

      expect(res.status).toBe(201);
      expect(ambulanceService.create).toHaveBeenCalled();
    });

    test('ambulance_staff cannot register fleet vehicles', async () => {
      const { userDoc, token } = generateUserAndToken('ambulance_staff', {
        ambulanceId: ownAmbulanceId
      });
      setupUserMock(userDoc);

      const res = await request(app)
        .post('/api/v1/ambulances')
        .set('Authorization', `Bearer ${token}`)
        .send({ ambulanceId: 'AMB-NEW' });

      expect(res.status).toBe(403);
      expect(ambulanceService.create).not.toHaveBeenCalled();
    });
  });

  describe('Ambulance Scoping on PATCH /api/v1/ambulances/:id/status', () => {
    test('ambulance_staff can update status of their OWN ambulance (200)', async () => {
      const { userDoc, token } = generateUserAndToken('ambulance_staff', {
        ambulanceId: ownAmbulanceId
      });
      setupUserMock(userDoc);
      ambulanceService.updateStatus.mockResolvedValue({ _id: ownAmbulanceId, status: 'en_route' });

      const res = await request(app)
        .patch(`/api/v1/ambulances/${ownAmbulanceId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'en_route' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('ambulance_staff is FORBIDDEN from updating status of ANOTHER ambulance (403)', async () => {
      const { userDoc, token } = generateUserAndToken('ambulance_staff', {
        ambulanceId: ownAmbulanceId
      });
      setupUserMock(userDoc);

      const res = await request(app)
        .patch(`/api/v1/ambulances/${otherAmbulanceId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'en_route' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/own ambulance/i);
    });

    test('coordinator can update status of ANY ambulance (200)', async () => {
      const { userDoc, token } = generateUserAndToken('coordinator');
      setupUserMock(userDoc);
      ambulanceService.updateStatus.mockResolvedValue({ _id: otherAmbulanceId, status: 'available' });

      const res = await request(app)
        .patch(`/api/v1/ambulances/${otherAmbulanceId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'available' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
