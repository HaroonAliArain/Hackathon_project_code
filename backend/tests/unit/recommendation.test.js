const { recommend } = require('../../src/services/recommendation.engine');

describe('Recommendation Engine Unit Tests', () => {
  const baseCase = {
    pickupLocation: { lat: 12.9716, lng: 77.5946 },
    requiredResources: [
      { resourceType: 'icu_bed', minCount: 2 }
    ],
    requiredSpecialties: ['cardiology']
  };

  test('scores and sorts eligible hospitals in descending order of score', () => {
    const hospitals = [
      {
        hospitalId: 'hosp-1',
        name: 'Apollo Hospital',
        status: 'active',
        etaMinutes: 10, // Higher travel score (100 - 10/60*100 ~= 83)
        specialties: ['cardiology'],
        resources: [
          { resourceType: 'icu_bed', availableCount: 5, status: 'confirmed' }
        ]
      },
      {
        hospitalId: 'hosp-2',
        name: 'Fortis Hospital',
        status: 'active',
        etaMinutes: 40, // Lower travel score (100 - 40/60*100 ~= 33)
        specialties: ['cardiology'],
        resources: [
          { resourceType: 'icu_bed', availableCount: 3, status: 'confirmed' }
        ]
      }
    ];

    const result = recommend({ case: baseCase, hospitals });
    expect(result.eligible).toHaveLength(2);
    expect(result.ineligible).toHaveLength(0);

    // Sorted descending by final score
    expect(result.eligible[0].hospitalId).toBe('hosp-1');
    expect(result.eligible[1].hospitalId).toBe('hosp-2');
    expect(result.eligible[0].score).toBeGreaterThan(result.eligible[1].score);

    // Verify component score structure
    expect(result.eligible[0].components).toHaveProperty('travel');
    expect(result.eligible[0].components).toHaveProperty('freshness');
    expect(result.eligible[0].components).toHaveProperty('capacity');
    expect(result.eligible[0].components).toHaveProperty('capability');
  });

  test('excludes closed hospitals into ineligible list', () => {
    const hospitals = [
      {
        hospitalId: 'hosp-closed',
        name: 'City General Hospital',
        status: 'closed', // Closed facility
        etaMinutes: 5,
        specialties: ['cardiology'],
        resources: [
          { resourceType: 'icu_bed', availableCount: 10, status: 'confirmed' }
        ]
      },
      {
        hospitalId: 'hosp-open',
        name: 'Metro Hospital',
        status: 'active',
        etaMinutes: 20,
        specialties: ['cardiology'],
        resources: [
          { resourceType: 'icu_bed', availableCount: 4, status: 'confirmed' }
        ]
      }
    ];

    const result = recommend({ case: baseCase, hospitals });
    expect(result.eligible).toHaveLength(1);
    expect(result.eligible[0].hospitalId).toBe('hosp-open');

    expect(result.ineligible).toHaveLength(1);
    expect(result.ineligible[0].hospitalId).toBe('hosp-closed');
    expect(result.ineligible[0].reasons).toContain('Hospital facility is currently closed');
  });

  test('generates warnings for eligible hospitals with stale resources', () => {
    const hospitals = [
      {
        hospitalId: 'hosp-stale',
        name: 'Grace Hospital',
        status: 'active',
        etaMinutes: 15,
        specialties: ['cardiology'],
        resources: [
          {
            resourceType: 'icu_bed',
            availableCount: 3,
            status: 'stale',
            ageMinutes: 130
          }
        ]
      }
    ];

    const result = recommend({ case: baseCase, hospitals });
    expect(result.eligible).toHaveLength(1);
    const candidate = result.eligible[0];

    expect(candidate.freshnessStatus).toBe('stale');
    expect(candidate.warnings.length).toBeGreaterThan(0);
    expect(candidate.warnings[0]).toMatch(/stale/i);
    expect(candidate.warnings[0]).toContain('icu_bed');
  });

  test('excludes hospitals with insufficient resource counts into ineligible list', () => {
    const hospitals = [
      {
        hospitalId: 'hosp-insufficient',
        name: 'Small Clinic',
        status: 'active',
        etaMinutes: 10,
        specialties: ['cardiology'],
        resources: [
          { resourceType: 'icu_bed', availableCount: 1, status: 'confirmed' } // Required is 2
        ]
      }
    ];

    const result = recommend({ case: baseCase, hospitals });
    expect(result.eligible).toHaveLength(0);
    expect(result.ineligible).toHaveLength(1);
    expect(result.ineligible[0].reasons[0]).toMatch(/Insufficient 'icu_bed'/i);
  });
});
