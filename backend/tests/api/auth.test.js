const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const User = require('../../src/models/User');
const envConfig = require('../../src/config/env');
const { authLimiter } = require('../../src/middleware/rateLimit');

jest.mock('../../src/models/User');
jest.mock('../../src/middleware/audit', () => ({
  createAuditEvent: jest.fn(),
  sanitizeData: jest.fn((d) => d)
}));

describe('Auth API Integration Tests (supertest)', () => {
  const mockUserId = '64f1a2b3c4d5e6f7a8b9c0d1';
  let mockUserDoc;

  beforeEach(() => {
    jest.clearAllMocks();

    mockUserDoc = {
      _id: mockUserId,
      name: 'Dr. Jane Coordinator',
      email: 'coordinator@emergencylink.org',
      role: 'coordinator',
      hospitalId: null,
      ambulanceId: null,
      accountStatus: 'active',
      isActive: true,
      comparePassword: jest.fn(),
      toObject: function () {
        return {
          _id: this._id,
          name: this.name,
          email: this.email,
          role: this.role,
          hospitalId: this.hospitalId,
          ambulanceId: this.ambulanceId,
          accountStatus: this.accountStatus
        };
      }
    };
  });

  test('applies the login rate limiter exactly once to the login route', () => {
    const authRouterLayer = app._router.stack.find(
      (layer) =>
        layer.name === 'router' &&
        Array.isArray(layer.handle.stack) &&
        layer.handle.stack.some((routeLayer) => routeLayer.route?.path === '/login')
    );
    const loginRouteLayer = authRouterLayer?.handle.stack.find(
      (routeLayer) => routeLayer.route?.path === '/login'
    );
    const appLevelLoginLimiters = app._router.stack.filter(
      (layer) => layer.route?.path === '/api/v1/auth/login'
    );

    expect(loginRouteLayer).toBeDefined();
    expect(loginRouteLayer.route.stack.filter((handler) => handler.handle === authLimiter)).toHaveLength(1);
    expect(appLevelLoginLimiters).toHaveLength(0);
  });

  describe('POST /api/v1/auth/login', () => {
    test('successfully logs in with valid credentials and returns JWT', async () => {
      mockUserDoc.comparePassword.mockResolvedValue(true);
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUserDoc)
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'coordinator@emergencylink.org',
          password: 'Password123!'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data).toHaveProperty('user');
      expect(res.body.data.user.email).toBe('coordinator@emergencylink.org');
      expect(res.body.data.user.passwordHash).toBeUndefined();

      // Verify JWT token validity and payload
      const decoded = jwt.verify(res.body.data.token, envConfig.JWT_SECRET);
      expect(decoded.id).toBe(mockUserId);
      expect(decoded.role).toBe('coordinator');
    });

    test('rejects login with wrong password (401)', async () => {
      mockUserDoc.comparePassword.mockResolvedValue(false);
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUserDoc)
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'coordinator@emergencylink.org',
          password: 'WrongPassword'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    test('rejects login for non-existent user (401)', async () => {
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'unknown@emergencylink.org',
          password: 'Password123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('rejects login with invalid email formatting via Zod validation (400)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'not-an-email',
          password: 'Password123!'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    test('returns authenticated user profile when valid Bearer token is provided', async () => {
      const token = jwt.sign(
        { id: mockUserId, role: 'coordinator' },
        envConfig.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const userQuery = {
        select: jest.fn().mockImplementation(() => userQuery),
        populate: jest.fn().mockImplementation(() => userQuery),
        then: (resolve, reject) => Promise.resolve(mockUserDoc).then(resolve, reject)
      };
      User.findById.mockImplementation(() => userQuery);

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('coordinator@emergencylink.org');
      expect(res.body.data.name).toBe('Dr. Jane Coordinator');
    });

    test('returns 401 when no token is provided', async () => {
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    test('returns 401 when invalid token is provided', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.jwt.token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
