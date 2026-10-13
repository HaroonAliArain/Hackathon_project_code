const {
  VALID_EMERGENCY_TRANSITIONS,
  VALID_AMBULANCE_TRANSITIONS,
  VALID_ASSIGNMENT_TRANSITIONS
} = require('../../src/config/constants');

describe('State Machine & Transitions Unit Tests', () => {
  describe('VALID_EMERGENCY_TRANSITIONS', () => {
    test('defines allowed transitions for all emergency lifecycle states', () => {
      expect(VALID_EMERGENCY_TRANSITIONS).toBeDefined();
      expect(typeof VALID_EMERGENCY_TRANSITIONS).toBe('object');
    });

    test('permits registered to transition to referral_pending and cancelled', () => {
      expect(VALID_EMERGENCY_TRANSITIONS.registered).toContain('referral_pending');
      expect(VALID_EMERGENCY_TRANSITIONS.registered).toContain('cancelled');
      expect(VALID_EMERGENCY_TRANSITIONS.registered).not.toContain('handed_over');
    });

    test('permits referral_pending to transition to destination_confirmed, registered, or cancelled', () => {
      const allowed = VALID_EMERGENCY_TRANSITIONS.referral_pending;
      expect(allowed).toContain('destination_confirmed');
      expect(allowed).toContain('cancelled');
    });

    test('permits destination_confirmed to transition to ambulance_assigned', () => {
      expect(VALID_EMERGENCY_TRANSITIONS.destination_confirmed).toContain('ambulance_assigned');
      expect(VALID_EMERGENCY_TRANSITIONS.destination_confirmed).not.toContain('registered');
    });

    test('permits ambulance_assigned to transition to en_route', () => {
      expect(VALID_EMERGENCY_TRANSITIONS.ambulance_assigned).toContain('en_route');
    });

    test('permits en_route to transition to arrived and cancelled', () => {
      expect(VALID_EMERGENCY_TRANSITIONS.en_route).toContain('arrived');
      expect(VALID_EMERGENCY_TRANSITIONS.en_route).toContain('cancelled');
    });

    test('permits arrived to transition to handed_over', () => {
      expect(VALID_EMERGENCY_TRANSITIONS.arrived).toContain('handed_over');
      expect(VALID_EMERGENCY_TRANSITIONS.arrived).not.toContain('en_route');
    });

    test('permits handed_over to transition to closed', () => {
      expect(VALID_EMERGENCY_TRANSITIONS.handed_over).toContain('closed');
    });

    test('closed and cancelled are terminal states with empty transition arrays', () => {
      expect(VALID_EMERGENCY_TRANSITIONS.closed).toEqual([]);
      expect(VALID_EMERGENCY_TRANSITIONS.cancelled).toEqual([]);
    });
  });

  describe('VALID_AMBULANCE_TRANSITIONS', () => {
    test('defines allowed transitions for ambulance fleet states', () => {
      expect(VALID_AMBULANCE_TRANSITIONS).toBeDefined();
    });

    test('permits available to transition to assigned or unavailable', () => {
      expect(VALID_AMBULANCE_TRANSITIONS.available).toContain('assigned');
      expect(VALID_AMBULANCE_TRANSITIONS.available).toContain('unavailable');
      expect(VALID_AMBULANCE_TRANSITIONS.available).not.toContain('arrived');
    });

    test('permits assigned to transition to en_route, available, or unavailable', () => {
      expect(VALID_AMBULANCE_TRANSITIONS.assigned).toContain('en_route');
      expect(VALID_AMBULANCE_TRANSITIONS.assigned).toContain('available');
    });

    test('permits en_route to transition to arrived or unavailable', () => {
      expect(VALID_AMBULANCE_TRANSITIONS.en_route).toContain('arrived');
      expect(VALID_AMBULANCE_TRANSITIONS.en_route).toContain('unavailable');
      expect(VALID_AMBULANCE_TRANSITIONS.en_route).not.toContain('assigned');
    });

    test('permits arrived to reset to available', () => {
      expect(VALID_AMBULANCE_TRANSITIONS.arrived).toContain('available');
    });

    test('permits unavailable to recover back to available', () => {
      expect(VALID_AMBULANCE_TRANSITIONS.unavailable).toEqual(['available']);
    });
  });

  describe('VALID_ASSIGNMENT_TRANSITIONS', () => {
    test('defines sequential assignment progression', () => {
      expect(VALID_ASSIGNMENT_TRANSITIONS).toBeDefined();
    });

    test('follows assigned -> en_route -> arrived -> handed_over sequence', () => {
      expect(VALID_ASSIGNMENT_TRANSITIONS.assigned).toEqual(['en_route']);
      expect(VALID_ASSIGNMENT_TRANSITIONS.en_route).toEqual(['arrived']);
      expect(VALID_ASSIGNMENT_TRANSITIONS.arrived).toEqual(['handed_over']);
    });

    test('handed_over is terminal with no further transitions', () => {
      expect(VALID_ASSIGNMENT_TRANSITIONS.handed_over).toEqual([]);
    });
  });
});
