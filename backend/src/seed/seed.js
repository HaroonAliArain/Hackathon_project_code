/**
 * @file seed.js
 * @description Master database seeding script for EmergencyLink.
 * Connects to MongoDB, clears existing documents across all 9 collections,
 * and inserts reproducible demo records with specific test scenarios.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const config = require('../config/env');
const connectDB = require('../config/db');

const User = require('../models/User');
const Hospital = require('../models/Hospital');
const ResourceSnapshot = require('../models/ResourceSnapshot');
const Emergency = require('../models/Emergency');
const Ambulance = require('../models/Ambulance');
const Referral = require('../models/Referral');
const Assignment = require('../models/Assignment');
const AuditEvent = require('../models/AuditEvent');
const SyncEvent = require('../models/SyncEvent');

const { SEED_LOCATIONS } = require('./travelMatrix');

/**
 * Main seeding execution routine
 */
async function runSeed() {
  console.log('--- Starting EmergencyLink Master Database Seed ---');
  console.log(`Environment: ${config.NODE_ENV}`);
  console.log(`Target Database: ${config.MONGODB_URI}`);

  try {
    await connectDB();

    // 1. Clear all 9 collections
    console.log('1. Clearing existing records across all 9 collections...');
    const collections = [
      User, Hospital, ResourceSnapshot, Emergency,
      Ambulance, Referral, Assignment, SyncEvent
    ];
    await Promise.all(collections.map((col) => col.deleteMany({})));
    try {
      await mongoose.connection.collection('auditevents').deleteMany({});
    } catch (e) {
      // Ignore if collection does not exist yet
    }
    console.log('   All collections successfully emptied.');

    // 2. Seed 6 Hospitals matching Section 19 test scenarios
    console.log('2. Seeding 6 scenario hospitals...');
    const now = Date.now();
    const MINUTE = 60 * 1000;

    const hospitalsData = [
      {
        name: 'City General Hospital',
        location: {
          lat: SEED_LOCATIONS.CITY_GENERAL.lat,
          lng: SEED_LOCATIONS.CITY_GENERAL.lng,
          address: SEED_LOCATIONS.CITY_GENERAL.address
        },
        specialties: [
          'Cardiology',
          'Emergency Medicine',
          'Critical Care',
          'Trauma Surgery',
          'Neurology'
        ],
        equipment: ['ventilator', 'ct_scanner', 'blood_bank', 'catheterization_lab'],
        status: 'active',
        contactPhone: '+1-555-0101'
      },
      {
        name: 'Riverside Medical Center',
        location: {
          lat: SEED_LOCATIONS.RIVERSIDE_MEDICAL.lat,
          lng: SEED_LOCATIONS.RIVERSIDE_MEDICAL.lng,
          address: SEED_LOCATIONS.RIVERSIDE_MEDICAL.address
        },
        specialties: [
          'Cardiology',
          'Emergency Medicine',
          'Critical Care',
          'Internal Medicine'
        ],
        equipment: ['ventilator', 'ct_scanner', 'blood_bank'],
        status: 'active',
        contactPhone: '+1-555-0102'
      },
      {
        name: 'Northgate Clinic',
        location: {
          lat: SEED_LOCATIONS.NORTHGATE_CLINIC.lat,
          lng: SEED_LOCATIONS.NORTHGATE_CLINIC.lng,
          address: SEED_LOCATIONS.NORTHGATE_CLINIC.address
        },
        specialties: ['Emergency Medicine', 'General Surgery', 'Orthopedics'], // Missing Cardiology -> Ineligible for cardiac cases
        equipment: ['ct_scanner', 'blood_bank'],
        status: 'active',
        contactPhone: '+1-555-0103'
      },
      {
        name: "St. Mary's Hospital",
        location: {
          lat: SEED_LOCATIONS.ST_MARYS.lat,
          lng: SEED_LOCATIONS.ST_MARYS.lng,
          address: SEED_LOCATIONS.ST_MARYS.address
        },
        specialties: ['Cardiology', 'Emergency Medicine', 'Critical Care', 'Pediatrics'],
        equipment: ['ventilator', 'ct_scanner', 'blood_bank'],
        status: 'active',
        contactPhone: '+1-555-0104'
      },
      {
        name: 'Eastside Trauma Center',
        location: {
          lat: SEED_LOCATIONS.EASTSIDE_TRAUMA.lat,
          lng: SEED_LOCATIONS.EASTSIDE_TRAUMA.lng,
          address: SEED_LOCATIONS.EASTSIDE_TRAUMA.address
        },
        specialties: ['Cardiology', 'Trauma Surgery', 'Emergency Medicine', 'Orthopedics'],
        equipment: ['ct_scanner', 'blood_bank', 'ventilator'],
        status: 'active',
        contactPhone: '+1-555-0105'
      },
      {
        name: 'Harbor Hospital',
        location: {
          lat: SEED_LOCATIONS.HARBOR_HOSPITAL.lat,
          lng: SEED_LOCATIONS.HARBOR_HOSPITAL.lng,
          address: SEED_LOCATIONS.HARBOR_HOSPITAL.address
        },
        specialties: ['General Medicine'],
        equipment: ['general_bed'],
        status: 'closed', // Closed status -> Excluded by recommendation engine
        contactPhone: '+1-555-0106'
      }
    ];

    const hospitals = await Hospital.create(hospitalsData);
    const [cityGeneral, riverside, northgate, stMarys, eastside, harbor] = hospitals;
    console.log(`   Seeded 6 hospitals: ${hospitals.map((h) => h.name).join(', ')}`);

    // 3. Seed 4 Ambulances
    console.log('3. Seeding 4 fleet ambulances...');
    const ambulancesData = [
      {
        ambulanceId: 'AMB-01',
        baseHospitalId: cityGeneral._id,
        status: 'available',
        lastKnownLocation: { lat: 37.776, lng: -122.417 },
        lastUpdatedAt: new Date(now - 2 * MINUTE)
      },
      {
        ambulanceId: 'AMB-02',
        baseHospitalId: riverside._id,
        status: 'available',
        lastKnownLocation: { lat: 37.796, lng: -122.403 },
        lastUpdatedAt: new Date(now - 3 * MINUTE)
      },
      {
        ambulanceId: 'AMB-03',
        baseHospitalId: stMarys._id,
        status: 'available',
        lastKnownLocation: { lat: 37.761, lng: -122.443 },
        lastUpdatedAt: new Date(now - 4 * MINUTE)
      },
      {
        ambulanceId: 'AMB-04',
        baseHospitalId: harbor._id,
        status: 'unavailable',
        lastKnownLocation: { lat: 37.741, lng: -122.381 },
        lastUpdatedAt: new Date(now - 60 * MINUTE)
      }
    ];

    const ambulances = await Ambulance.create(ambulancesData);
    const [amb01, amb02, amb03, amb04] = ambulances;
    console.log(`   Seeded 4 ambulances: ${ambulances.map((a) => a.ambulanceId).join(', ')}`);

    // 4. Seed 7 Demo Users using SEED_PASSWORD
    console.log('4. Seeding 7 demo user accounts...');
    const seedPassword = config.SEED_PASSWORD || 'Demo@12345';
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(seedPassword, salt);

    const usersData = [
      {
        name: 'Demo Dispatch Coordinator',
        email: 'coordinator@demo.test',
        passwordHash,
        role: 'coordinator',
        accountStatus: 'active'
      },
      {
        name: 'Ambulance Staff AMB-01',
        email: 'amb1@demo.test',
        passwordHash,
        role: 'ambulance_staff',
        ambulanceId: amb01._id,
        accountStatus: 'active'
      },
      {
        name: 'City General Staff',
        email: 'city.staff@demo.test',
        passwordHash,
        role: 'hospital_staff',
        hospitalId: cityGeneral._id,
        accountStatus: 'active'
      },
      {
        name: 'Riverside Staff',
        email: 'riverside.staff@demo.test',
        passwordHash,
        role: 'hospital_staff',
        hospitalId: riverside._id,
        accountStatus: 'active'
      },
      {
        name: "St. Mary's Staff",
        email: 'stmarys.staff@demo.test',
        passwordHash,
        role: 'hospital_staff',
        hospitalId: stMarys._id,
        accountStatus: 'active'
      },
      {
        name: 'System Administrator',
        email: 'admin@demo.test',
        passwordHash,
        role: 'system_admin',
        accountStatus: 'active'
      },
      {
        name: 'Regional Health Observer',
        email: 'observer@demo.test',
        passwordHash,
        role: 'observer',
        accountStatus: 'active'
      }
    ];

    const users = await User.create(usersData);
    const [coordinator, ambStaff1, cityStaff, riversideStaff, stMarysStaff, adminUser, observerUser] = users;
    console.log(`   Seeded 7 demo users with password '${seedPassword}'`);

    // 5. Seed ResourceSnapshots matching deliberate scenarios
    console.log('5. Seeding resource snapshots with calculated freshness profiles...');
    const snapshotDocs = [];

    // Scenario A: City General (Active, Full Capability, Fresh & Confirmed)
    // verifiedAt within 30 min -> freshness: 'confirmed'
    const cityReportedAt = new Date(now - 5 * MINUTE);
    const cityVerifiedAt = new Date(now - 5 * MINUTE);
    const cityResources = [
      { resourceType: 'icu_bed', availableCount: 5, totalCapacity: 12 },
      { resourceType: 'er_bed', availableCount: 8, totalCapacity: 20 },
      { resourceType: 'ventilator', availableCount: 4, totalCapacity: 8 },
      { resourceType: 'cardiologist_on_call', availableCount: 2, totalCapacity: 2 },
      { resourceType: 'trauma_team', availableCount: 1, totalCapacity: 2 },
      { resourceType: 'ct_scanner', availableCount: 1, totalCapacity: 1 },
      { resourceType: 'blood_bank', availableCount: 10, totalCapacity: 10 }
    ];
    for (const res of cityResources) {
      snapshotDocs.push({
        hospitalId: cityGeneral._id,
        resourceType: res.resourceType,
        availableCount: res.availableCount,
        totalCapacity: res.totalCapacity,
        reportedAt: cityReportedAt,
        verifiedAt: cityVerifiedAt,
        reportedBy: cityStaff._id
      });
    }

    // Scenario B: Riverside Medical (Active, Full Capability, STALE telemetry > 120m)
    // reportedAt 150m ago, verifiedAt null -> freshness: 'stale'
    const riversideReportedAt = new Date(now - 150 * MINUTE);
    const riversideResources = [
      { resourceType: 'icu_bed', availableCount: 4, totalCapacity: 10 },
      { resourceType: 'er_bed', availableCount: 6, totalCapacity: 15 },
      { resourceType: 'ventilator', availableCount: 3, totalCapacity: 6 },
      { resourceType: 'cardiologist_on_call', availableCount: 1, totalCapacity: 1 },
      { resourceType: 'ct_scanner', availableCount: 1, totalCapacity: 1 }
    ];
    for (const res of riversideResources) {
      snapshotDocs.push({
        hospitalId: riverside._id,
        resourceType: res.resourceType,
        availableCount: res.availableCount,
        totalCapacity: res.totalCapacity,
        reportedAt: riversideReportedAt,
        verifiedAt: null,
        reportedBy: riversideStaff._id
      });
    }

    // Scenario C: Northgate Clinic (Active, Missing Cardiology -> Test Ineligible)
    // Has ICU, ER, Ventilator, but NO cardiologist_on_call
    const northgateReportedAt = new Date(now - 12 * MINUTE);
    const northgateVerifiedAt = new Date(now - 12 * MINUTE);
    const northgateResources = [
      { resourceType: 'icu_bed', availableCount: 2, totalCapacity: 4 },
      { resourceType: 'er_bed', availableCount: 4, totalCapacity: 10 },
      { resourceType: 'ventilator', availableCount: 1, totalCapacity: 2 },
      { resourceType: 'cardiologist_on_call', availableCount: 0, totalCapacity: 0 }
    ];
    for (const res of northgateResources) {
      snapshotDocs.push({
        hospitalId: northgate._id,
        resourceType: res.resourceType,
        availableCount: res.availableCount,
        totalCapacity: res.totalCapacity,
        reportedAt: northgateReportedAt,
        verifiedAt: northgateVerifiedAt,
        reportedBy: adminUser._id
      });
    }

    // Scenario D: St. Mary's (Active, Capable, Intended for Referral Rejection Demonstration)
    const stMarysReportedAt = new Date(now - 15 * MINUTE);
    const stMarysVerifiedAt = new Date(now - 15 * MINUTE);
    const stMarysResources = [
      { resourceType: 'icu_bed', availableCount: 3, totalCapacity: 8 },
      { resourceType: 'er_bed', availableCount: 5, totalCapacity: 12 },
      { resourceType: 'ventilator', availableCount: 2, totalCapacity: 5 },
      { resourceType: 'cardiologist_on_call', availableCount: 1, totalCapacity: 2 }
    ];
    for (const res of stMarysResources) {
      snapshotDocs.push({
        hospitalId: stMarys._id,
        resourceType: res.resourceType,
        availableCount: res.availableCount,
        totalCapacity: res.totalCapacity,
        reportedAt: stMarysReportedAt,
        verifiedAt: stMarysVerifiedAt,
        reportedBy: stMarysStaff._id
      });
    }

    // Scenario E: Eastside Trauma (Active, Capable, ICU Count UNKNOWN / null)
    // availableCount is null -> freshness: 'unknown'
    const eastsideReportedAt = new Date(now - 20 * MINUTE);
    const eastsideResources = [
      { resourceType: 'icu_bed', availableCount: null, totalCapacity: 10, verifiedAt: null },
      { resourceType: 'er_bed', availableCount: 7, totalCapacity: 15, verifiedAt: eastsideReportedAt },
      { resourceType: 'ventilator', availableCount: 2, totalCapacity: 4, verifiedAt: eastsideReportedAt },
      { resourceType: 'cardiologist_on_call', availableCount: 1, totalCapacity: 1, verifiedAt: eastsideReportedAt }
    ];
    for (const res of eastsideResources) {
      snapshotDocs.push({
        hospitalId: eastside._id,
        resourceType: res.resourceType,
        availableCount: res.availableCount,
        totalCapacity: res.totalCapacity,
        reportedAt: eastsideReportedAt,
        verifiedAt: res.verifiedAt,
        reportedBy: adminUser._id
      });
    }

    // Scenario F: Harbor Hospital (Status: Closed -> Excluded)
    snapshotDocs.push({
      hospitalId: harbor._id,
      resourceType: 'general_bed',
      availableCount: 0,
      totalCapacity: 20,
      reportedAt: new Date(now - 300 * MINUTE),
      verifiedAt: null,
      reportedBy: adminUser._id
    });

    await ResourceSnapshot.create(snapshotDocs);
    console.log(`   Seeded ${snapshotDocs.length} resource snapshots across 6 hospitals.`);

    // 6. Seed 3 Sample Emergencies across distinct lifecycle states
    console.log('6. Seeding 3 sample emergencies...');

    // Emergency 1: Registered (Triage complete, awaiting referral)
    const emergency1 = await Emergency.create({
      caseId: 'CASE-2026-0001',
      priorityCategory: 'critical',
      summary: '62yo male, severe retrosternal chest pain, radiating to left arm. STEMI confirmed by field ECG.',
      requiredResources: [
        { resourceType: 'icu_bed', minCount: 1 },
        { resourceType: 'cardiologist_on_call', minCount: 1 }
      ],
      requiredSpecialties: ['Cardiology', 'Emergency Medicine'],
      pickupLocation: {
        lat: SEED_LOCATIONS.INCIDENT_DOWNTOWN.lat,
        lng: SEED_LOCATIONS.INCIDENT_DOWNTOWN.lng,
        address: SEED_LOCATIONS.INCIDENT_DOWNTOWN.address
      },
      status: 'registered',
      createdBy: coordinator._id
    });

    // Emergency 2: Referral Pending (Referred to St. Mary's for rejection/clarification demo)
    const emergency2 = await Emergency.create({
      caseId: 'CASE-2026-0002',
      priorityCategory: 'urgent',
      summary: '45yo female, high-velocity motor vehicle accident. Blunt chest trauma and suspected pelvic fracture.',
      requiredResources: [
        { resourceType: 'er_bed', minCount: 1 },
        { resourceType: 'trauma_team', minCount: 1 }
      ],
      requiredSpecialties: ['Trauma Surgery', 'Emergency Medicine'],
      pickupLocation: {
        lat: SEED_LOCATIONS.INCIDENT_WESTSIDE.lat,
        lng: SEED_LOCATIONS.INCIDENT_WESTSIDE.lng,
        address: SEED_LOCATIONS.INCIDENT_WESTSIDE.address
      },
      status: 'referral_pending',
      createdBy: coordinator._id
    });

    // Associated pending referral for Emergency 2
    const referral2 = await Referral.create({
      caseId: emergency2.caseId,
      hospitalId: stMarys._id,
      requestStatus: 'pending',
      requestedBy: coordinator._id,
      requestedAt: new Date(now - 6 * MINUTE),
      rankSnapshot: {
        score: 84.5,
        breakdown: {
          travel: 90,
          freshness: 100,
          capacity: 65,
          capability: 100
        }
      }
    });

    // Emergency 3: Destination Confirmed (Referral accepted by City General, awaiting dispatch)
    const emergency3 = await Emergency.create({
      caseId: 'CASE-2026-0003',
      priorityCategory: 'standard',
      summary: '38yo female, acute asthma exacerbation refractory to nebulized albuterol, accessory muscle usage.',
      requiredResources: [
        { resourceType: 'er_bed', minCount: 1 },
        { resourceType: 'ventilator', minCount: 1 }
      ],
      requiredSpecialties: ['Emergency Medicine'],
      pickupLocation: {
        lat: SEED_LOCATIONS.INCIDENT_WATERFRONT.lat,
        lng: SEED_LOCATIONS.INCIDENT_WATERFRONT.lng,
        address: SEED_LOCATIONS.INCIDENT_WATERFRONT.address
      },
      status: 'destination_confirmed',
      confirmedHospitalId: cityGeneral._id,
      createdBy: coordinator._id
    });

    // Associated accepted referral for Emergency 3
    const referral3 = await Referral.create({
      caseId: emergency3.caseId,
      hospitalId: cityGeneral._id,
      requestStatus: 'accepted',
      requestedBy: coordinator._id,
      requestedAt: new Date(now - 14 * MINUTE),
      responseAt: new Date(now - 10 * MINUTE),
      respondedBy: cityStaff._id,
      responseNote: 'Resuscitation Bay 2 prepped. Respiratory therapist and ventilator standing by.',
      rankSnapshot: {
        score: 91.2,
        breakdown: {
          travel: 85,
          freshness: 100,
          capacity: 88,
          capability: 100
        }
      }
    });

    console.log('   Seeded 3 emergencies: CASE-2026-0001 (registered), CASE-2026-0002 (referral_pending), CASE-2026-0003 (destination_confirmed)');

    // 7. Seed Initial Audit Log
    console.log('7. Seeding bootstrap audit trail events...');
    await AuditEvent.create([
      {
        actorId: adminUser._id,
        actorRole: 'system_admin',
        eventType: 'user_created',
        recordType: 'DatabaseSeed',
        recordId: 'INIT-SEED',
        after: { description: 'Database bootstrapped with scenario seed dataset' },
        source: 'online'
      },
      {
        actorId: coordinator._id,
        actorRole: 'coordinator',
        eventType: 'emergency_created',
        recordType: 'Emergency',
        recordId: emergency1._id,
        after: { caseId: emergency1.caseId, status: emergency1.status },
        source: 'online'
      },
      {
        actorId: cityStaff._id,
        actorRole: 'hospital_staff',
        eventType: 'referral_responded',
        recordType: 'Referral',
        recordId: referral3._id,
        after: { caseId: emergency3.caseId, requestStatus: 'accepted' },
        source: 'online'
      }
    ]);
    console.log('   Seeded bootstrap audit trail.');

    console.log('\n--- Seed Execution Finished Successfully ---');
    console.log('Summary of Seeded Entities:');
    console.log(`- Hospitals: ${hospitals.length}`);
    console.log(`- Ambulances: ${ambulances.length}`);
    console.log(`- Demo Users: ${users.length}`);
    console.log(`- Resource Snapshots: ${snapshotDocs.length}`);
    console.log(`- Emergencies: 3`);
    console.log(`- Referrals: 2`);
    console.log('Credentials: Password for all demo accounts is Demo@12345');

    process.exit(0);
  } catch (err) {
    console.error('FATAL: Database seed script failed with error:', err);
    process.exit(1);
  }
}

// Execute script if run directly
if (require.main === module) {
  runSeed();
}

module.exports = runSeed;
