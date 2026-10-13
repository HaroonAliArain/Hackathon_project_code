const { computeFreshness } = require('../../src/services/resource.service');

describe('Freshness Computation Unit Tests', () => {
  const ONE_MINUTE_MS = 60 * 1000;

  describe('Status: unknown', () => {
    test('returns unknown when snapshot is null or undefined', () => {
      const resNull = computeFreshness(null);
      expect(resNull.status).toBe('unknown');
      expect(resNull.ageMinutes).toBeNull();

      const resUndef = computeFreshness(undefined);
      expect(resUndef.status).toBe('unknown');
      expect(resUndef.ageMinutes).toBeNull();
    });

    test('returns unknown when availableCount is null or undefined', () => {
      const res = computeFreshness({
        availableCount: null,
        reportedAt: new Date()
      });
      expect(res.status).toBe('unknown');
      expect(res.ageMinutes).toBeNull();
    });
  });

  describe('Status: unavailable', () => {
    test('returns unavailable when availableCount is 0 regardless of verification', () => {
      const now = new Date();
      const res = computeFreshness({
        availableCount: 0,
        reportedAt: now,
        verifiedAt: now
      });
      expect(res.status).toBe('unavailable');
      expect(typeof res.ageMinutes).toBe('number');
      expect(res.ageMinutes).toBe(0);
    });
  });

  describe('Status: stale', () => {
    test('returns stale when reportedAt is older than stale threshold (e.g., 200 minutes ago)', () => {
      const pastTime = new Date(Date.now() - 200 * ONE_MINUTE_MS);
      const res = computeFreshness({
        availableCount: 5,
        reportedAt: pastTime,
        verifiedAt: null
      });
      expect(res.status).toBe('stale');
      expect(res.ageMinutes).toBeGreaterThanOrEqual(199);
    });
  });

  describe('Status: confirmed', () => {
    test('returns confirmed when recently reported and verified within max confirmation age', () => {
      const reportedTime = new Date(Date.now() - 5 * ONE_MINUTE_MS);
      const verifiedTime = new Date(Date.now() - 2 * ONE_MINUTE_MS);
      const res = computeFreshness({
        availableCount: 8,
        reportedAt: reportedTime,
        verifiedAt: verifiedTime
      });
      expect(res.status).toBe('confirmed');
      expect(res.ageMinutes).toBe(5);
    });
  });

  describe('Status: unconfirmed', () => {
    test('returns unconfirmed when recently reported but verifiedAt is null', () => {
      const reportedTime = new Date(Date.now() - 2 * ONE_MINUTE_MS);
      const res = computeFreshness({
        availableCount: 4,
        reportedAt: reportedTime,
        verifiedAt: null
      });
      expect(res.status).toBe('unconfirmed');
      expect(res.ageMinutes).toBe(2);
    });

    test('returns unconfirmed when verifiedAt is older than confirmation window', () => {
      const reportedTime = new Date(Date.now() - 10 * ONE_MINUTE_MS);
      const oldVerifiedTime = new Date(Date.now() - 40 * ONE_MINUTE_MS);
      const res = computeFreshness({
        availableCount: 4,
        reportedAt: reportedTime,
        verifiedAt: oldVerifiedTime
      });
      expect(res.status).toBe('unconfirmed');
    });
  });
});
