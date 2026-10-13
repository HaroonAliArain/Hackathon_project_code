# EmergencyLink API & Real-Time Socket Contract

**Version:** 1.0.0  
**Base URL:** `http://localhost:5000/api/v1`  
**WebSocket URL:** `ws://localhost:5000`  
**Protocol:** RESTful JSON over HTTP/1.1 & WebSocket over Socket.IO v4

---

## 1. Architectural Standards & Response Conventions

### 1.1 Headers
All requests containing a payload must supply:
```http
Content-Type: application/json
```
Authenticated routes require a Bearer token in the standard HTTP header:
```http
Authorization: Bearer <jwt_token>
```

### 1.2 Uniform Envelope Standard
Every API response strictly follows one of two envelope contracts:

#### Success Envelope (`2xx`)
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 20
  }
}
```
*(Note: `meta` is included whenever collection pagination or calculation metadata applies).*

#### Error Envelope (`4xx` / `5xx`)
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "pickupLocation.lat",
        "message": "Latitude must be a valid number"
      }
    ]
  }
}
```

### 1.3 Standard Error Code Catalog
| HTTP Code | Error Code | Description |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Schema validation failed (Zod or Mongoose validation details attached) |
| `401` | `UNAUTHENTICATED` | Missing, malformed, or expired JWT |
| `403` | `FORBIDDEN` | Insufficient role or accessing resource outside scoped hospital/ambulance |
| `404` | `NOT_FOUND` | Target entity does not exist |
| `409` | `CONFLICT` | Unique key violation (e.g. duplicate email/caseId) |
| `409` | `INVALID_TRANSITION` | Attempted illegal state machine transition |
| `429` | `RATE_LIMITED` | Request threshold exceeded |
| `500` | `INTERNAL_ERROR` | Unexpected server error (sanitized in production) |

---

## 2. Authentication & Role-Based Access Control (RBAC)

### 2.1 Role Definitions
- `coordinator`: Emergency response dispatch coordinators (Full operational lifecycle access).
- `ambulance_staff`: Paramedics and drivers assigned to ambulances.
- `hospital_staff`: Triage nurses, ER physicians, and admission coordinators scoped to a hospital.
- `hospital_admin`: Hospital clinical administrators (can manage staff and hospital parameters).
- `system_admin`: Platform super-administrators (complete bypass on all scopes).
- `observer`: Read-only public health observers and audit reviewers.

---

## 3. REST API Route Specifications

### 3.1 System Health
#### `GET /api/v1/health`
- **Access:** Public
- **Success (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-10-13T12:00:00.000Z",
    "uptime": 124.5
  }
}
```

---

### 3.2 Authentication (`/api/v1/auth`)

#### `POST /api/v1/auth/login`
- **Access:** Public (Rate limited: 10 attempts / 15 minutes)
- **Request Body:**
```json
{
  "email": "coordinator@demo.test",
  "password": "Demo@12345"
}
```
- **Success (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "6543210987abcdef01234567",
      "name": "Demo Dispatch Coordinator",
      "email": "coordinator@demo.test",
      "role": "coordinator",
      "hospitalId": null,
      "ambulanceId": null,
      "accountStatus": "active"
    }
  }
}
```

#### `GET /api/v1/auth/me`
- **Access:** Private (Any authenticated user)
- **Success (`200 OK`):** Returns authenticated user profile without `passwordHash`.

---

### 3.3 Emergency Management (`/api/v1/emergencies`)

#### `POST /api/v1/emergencies`
- **Access:** Private (`coordinator`, `ambulance_staff`, `system_admin`)
- **Request Body:**
```json
{
  "caseId": "CASE-2026-0004",
  "priorityCategory": "critical",
  "summary": "70yo female presenting with acute respiratory failure and hypotension",
  "requiredResources": [
    { "resourceType": "icu_bed", "minCount": 1 },
    { "resourceType": "ventilator", "minCount": 1 }
  ],
  "requiredSpecialties": ["Critical Care", "Pulmonology"],
  "pickupLocation": {
    "lat": 37.7780,
    "lng": -122.4150,
    "address": "Market St & 5th St, Downtown"
  }
}
```
- **Success (`201 Created`):** Returns created emergency document with initial `status: "registered"`.

#### `GET /api/v1/emergencies`
- **Access:** Private (Authenticated)
- **Query Params:** `status`, `priorityCategory`, `page`, `limit`
- **Success (`200 OK`):** Returns list of cases scoped to caller role with pagination meta.

#### `GET /api/v1/emergencies/:id`
- **Access:** Private (Authenticated)
- **Parameters:** `:id` (MongoDB ObjectId or `caseId`)
- **Success (`200 OK`):** Returns emergency case details.

#### `PATCH /api/v1/emergencies/:id/status`
- **Access:** Private (Authenticated with valid transition permissions)
- **Request Body:**
```json
{
  "status": "referral_pending"
}
```
- **State Machine Transitions:**
  - `registered` -> `referral_pending`, `cancelled`
  - `referral_pending` -> `destination_confirmed`, `registered`, `cancelled`
  - `destination_confirmed` -> `ambulance_assigned`, `cancelled`
  - `ambulance_assigned` -> `en_route`, `cancelled`
  - `en_route` -> `arrived`, `cancelled`
  - `arrived` -> `handed_over`
  - `handed_over` -> `closed`

---

### 3.4 Hospitals & Real-Time Resources (`/api/v1/hospitals`)

#### `GET /api/v1/hospitals`
- **Access:** Private (Authenticated)
- **Query Params:** `status` (default: exclude closed)
- **Success (`200 OK`):**
  Returns array of hospitals with dynamically calculated `freshnessStatus` for each resource:
  - `confirmed`: Reported/verified within `RESOURCE_CONFIRMED_MAX_AGE` (<= 30 min)
  - `unconfirmed`: Reported between 30 and 120 min ago without recent verification
  - `stale`: Older than `RESOURCE_STALE_AFTER` (> 120 min)
  - `unknown`: Resource count missing or `null`
  - `unavailable`: Capacity reported as `0`

#### `POST /api/v1/hospitals`
- **Access:** Private (`system_admin`)
- **Request Body:**
```json
{
  "name": "Example Hospital",
  "location": {
    "lat": 12.9716,
    "lng": 77.5946,
    "address": "Fictional demo address"
  },
  "specialties": ["cardiology"],
  "equipment": ["ct_scanner"],
  "status": "active",
  "contactPhone": "+1 555 0100"
}
```
- **Success (`201 Created`):** Creates the hospital and records an audit event. Initial resource figures can then be recorded with `PUT /api/v1/hospitals/:id/resources`.

#### `GET /api/v1/hospitals/:id/resources`
- **Access:** Private (Authenticated)
- **Success (`200 OK`):** Returns current latest resource snapshots and history.

#### `PUT /api/v1/hospitals/:id/resources`
- **Access:** Private (`hospital_staff`, `hospital_admin`, `system_admin` scoped to target hospital)
- **Request Body:**
```json
{
  "updates": [
    { "resourceType": "icu_bed", "availableCount": 6, "totalCapacity": 12 },
    { "resourceType": "ventilator", "availableCount": 5, "totalCapacity": 8 }
  ],
  "verified": false
}
```
- **Success (`200 OK`):** Appends immutable `ResourceSnapshot` records and emits `resource:updated` WebSocket event.

#### `POST /api/v1/hospitals/:id/resources/confirm`
- **Access:** Private (`hospital_staff`, `hospital_admin`, `system_admin` scoped to target hospital)
- **Request Body:** `{}` (or empty)
- **Success (`200 OK`):** Updates `verifiedAt = now` on current resource snapshots, upgrading status to `confirmed`.

---

### 3.5 Recommendations Engine (`/api/v1/recommendations`)

#### `POST /api/v1/recommendations`
- **Access:** Private (`coordinator`, `system_admin`)
- **Request Body:**
```json
{
  "caseId": "CASE-2026-0001",
  "weights": {
    "travel": 0.40,
    "freshness": 0.30,
    "capacity": 0.20,
    "capability": 0.10
  }
}
```
- **Scoring Formulas:**
  - **Travel (40%):** `clamp(100 - (etaMinutes / 60) * 100)`
  - **Freshness (30%):** `confirmed = 100`, `unconfirmed = 70`, `stale = 30`, `unknown = 10`, `unavailable = 0`
  - **Capacity (20%):** `clamp((availableCount / totalCapacity) * 100)`
  - **Capability (10%):** Percentage of emergency required specialties matched by hospital
- **Success (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "eligible": [
      {
        "hospitalId": "6543210987abcdef01234561",
        "name": "City General Hospital",
        "score": 93.4,
        "etaMinutes": 4,
        "breakdown": {
          "travel": 93,
          "freshness": 100,
          "capacity": 85,
          "capability": 100
        },
        "reasons": [
          "Travel ETA: 4 mins (score: 93/100)",
          "All requested critical resources confirmed fresh",
          "Full cardiology specialty coverage"
        ]
      }
    ],
    "ineligible": [
      {
        "hospitalId": "6543210987abcdef01234563",
        "name": "Northgate Clinic",
        "ineligibilityReasons": [
          "Missing required specialty: Cardiology",
          "Insufficient 'cardiologist_on_call': requires 1, available 0"
        ]
      },
      {
        "hospitalId": "6543210987abcdef01234566",
        "name": "Harbor Hospital",
        "ineligibilityReasons": [
          "Hospital facility is currently closed"
        ]
      }
    ],
    "disclaimer": "Operational ranking only. Requires human review and hospital acceptance."
  }
}
```

---

### 3.6 Referral Coordination (`/api/v1/referrals`)

#### `POST /api/v1/referrals`
- **Access:** Private (`coordinator`, `system_admin`)
- **Request Body:**
```json
{
  "caseId": "CASE-2026-0001",
  "hospitalId": "6543210987abcdef01234561",
  "rankSnapshot": {
    "score": 93.4,
    "breakdown": { "travel": 93, "freshness": 100, "capacity": 85, "capability": 100 }
  }
}
```
- **Success (`201 Created`):** Emits `referral:requested` to hospital room and coordinator room.

#### `PATCH /api/v1/referrals/:id/respond`
- **Access:** Private (`hospital_staff`, `hospital_admin`, `system_admin` scoped to receiving hospital)
- **Request Body:**
```json
{
  "requestStatus": "accepted",
  "responseNote": "Cath Lab 1 prepared. Interventional team standing by."
}
```
- **Allowed response statuses:** `accepted`, `rejected`, `clarification_requested`
- **Success (`200 OK`):** Automatically transitions Emergency to `destination_confirmed` if accepted.

#### `PATCH /api/v1/referrals/:id/clarify`
- **Access:** Private (`coordinator`, `system_admin`)
- **Request Body:**
```json
{
  "clarification": "Patient currently receiving dual antiplatelet therapy. ETA is 8 minutes."
}
```

---

### 3.7 Ambulance Fleet & Dispatch (`/api/v1/ambulances` & `/api/v1/assignments`)

#### `GET /api/v1/ambulances`
- **Access:** Private (Authenticated)
- **Success (`200 OK`):** Returns fleet ambulances with statuses (`available`, `assigned`, `en_route`, `arrived`, `unavailable`).

#### `POST /api/v1/ambulances`
- **Access:** Private (`coordinator`, `system_admin`)
- **Request Body:**
```json
{
  "ambulanceId": "AMB-05",
  "baseHospitalId": "6543210987abcdef01234561"
}
```
- **Success (`201 Created`):** Registers the vehicle as `available` and records an audit event. `baseHospitalId` is optional but must reference an existing hospital when provided.

#### `PATCH /api/v1/ambulances/:id/status`
- **Access:** Private (`coordinator`, `ambulance_staff`, `system_admin` scoped to ambulance)
- **Request Body:**
```json
{
  "status": "en_route",
  "location": { "lat": 37.7770, "lng": -122.4160 }
}
```

#### `POST /api/v1/assignments`
- **Access:** Private (`coordinator`, `system_admin`)
- **Request Body:**
```json
{
  "caseId": "CASE-2026-0003",
  "ambulanceId": "6543210987abcdef01234571",
  "destinationHospitalId": "6543210987abcdef01234561"
}
```
- **Success (`201 Created`):** Transitions ambulance status to `assigned` and emergency to `ambulance_assigned`.

#### `PATCH /api/v1/assignments/:id/status`
- **Access:** Private (Authenticated / Ambulance staff assigned)
- **Request Body:**
```json
{
  "status": "handed_over"
}
```
- **Lifecycle transitions:** `assigned` -> `en_route` -> `arrived` -> `handed_over`

---

### 3.8 Dashboard, Analytics & Audit (`/api/v1/dashboard`, `/analytics`, `/audit-events`)

#### `GET /api/v1/dashboard/summary`
- **Access:** Private (Authenticated)
- **Success (`200 OK`):** Returns real-time counts of active emergencies, available ambulances, critical bed availability, and pending referrals.

#### `GET /api/v1/analytics/metrics`
- **Access:** Private (`coordinator`, `system_admin`, `observer`)
- **Success (`200 OK`):** Returns dispatch-to-arrival latency averages, SLA compliance percentages, and referral rejection rates.

#### `GET /api/v1/audit-events`
- **Access:** Private (`coordinator`, `hospital_staff`, `hospital_admin`, `system_admin`, `observer`)
- **Query Params:** `actorId`, `eventType`, `recordType`, `recordId`, `startDate`, `endDate`, `page`, `limit`
- **Success (`200 OK`):** Append-only audit trail logs with sensitive tokens scrubbed.

---

### 3.9 Offline Synchronization (`/api/v1/sync`)

#### `POST /api/v1/sync/events`
- **Access:** Private (Authenticated)
- **Request Body:**
```json
{
  "events": [
    {
      "clientEventId": "evt-uuid-101",
      "type": "ambulance_status_change",
      "baseVersion": 2,
      "clientTimestamp": "2026-10-13T12:05:00.000Z",
      "payload": {
        "ambulanceId": "AMB-01",
        "status": "en_route",
        "lat": 37.777,
        "lng": -122.416
      }
    }
  ]
}
```
- **Success (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "processed": [
      {
        "clientEventId": "evt-uuid-101",
        "syncStatus": "applied",
        "conflictStatus": "none"
      }
    ]
  }
}
```

#### `GET /api/v1/sync/conflicts`
- **Access:** Private (`coordinator`, `hospital_admin`, `system_admin`)

#### `POST /api/v1/sync/conflicts/:id/resolve`
- **Access:** Private (`coordinator`, `hospital_admin`, `system_admin`)

---

## 4. Real-Time Socket.IO Architecture

### 4.1 Connection & Handshake
Clients connect to root namespace `/` with authentication via handshake `auth` object or `Authorization` header:
```javascript
const socket = io('http://localhost:5000', {
  auth: {
    token: '<jwt_token>'
  }
});
```

### 4.2 Automated Room Assignments
Upon authentication, the socket joins appropriate rooms:
- **All Coordinators, Admins, Observers:** `role:coordinator`
- **Hospital Staff:** `hospital:<hospitalId>`
- **Ambulance Staff:** `ambulance:<ambulanceId>`

### 4.3 Client-to-Server Subscription Events
| Event | Payload | Description |
|---|---|---|
| `join:case` | `caseId: string` | Subscribe to updates for a specific emergency case |
| `leave:case` | `caseId: string` | Unsubscribe from a specific emergency case |

### 4.4 Server-to-Client Emitted Events
| Event Name | Target Room(s) | Payload Structure |
|---|---|---|
| `emergency:created` | `role:coordinator` | `{ id, caseId, status, priorityCategory, timestamp }` |
| `emergency:status_updated` | `role:coordinator`, `case:<caseId>`, `hospital:<hospitalId>` | `{ id, caseId, status, confirmedHospitalId, timestamp }` |
| `resource:updated` | `role:coordinator`, `hospital:<hospitalId>` | `{ hospitalId, resources, timestamp }` |
| `resource:stale` | `role:coordinator`, `hospital:<hospitalId>` | `{ hospitalId, resourceType, ageMinutes, status, timestamp }` |
| `referral:requested` | `hospital:<hospitalId>`, `role:coordinator` | `{ id, caseId, hospitalId, requestStatus, requestedAt }` |
| `referral:responded` | `role:coordinator`, `case:<caseId>` | `{ id, caseId, hospitalId, requestStatus, responseAt }` |
| `ambulance:status_updated` | `role:coordinator`, `ambulance:<ambulanceId>` | `{ ambulanceId, status, location, lastUpdatedAt }` |
| `assignment:status_updated` | `role:coordinator`, `case:<caseId>`, `ambulance:<ambulanceId>` | `{ id, caseId, ambulanceId, status, timestamp }` |

---

## 5. Seed Test Scenarios & Demo Credentials

**Default Demo Password:** `Demo@12345`

### 5.1 Demo Accounts
| Email | Role | Associated Entity | Testing Focus |
|---|---|---|---|
| `coordinator@demo.test` | `coordinator` | All regional resources | Case creation, recommendation queries, referral dispatch |
| `amb1@demo.test` | `ambulance_staff` | `AMB-01` | Telemetry updates, en route status, bedside handovers |
| `city.staff@demo.test` | `hospital_staff` | `City General Hospital` | Confirming resources, accepting cardiac referrals |
| `riverside.staff@demo.test` | `hospital_staff` | `Riverside Medical Center` | Refreshing stale resources |
| `stmarys.staff@demo.test` | `hospital_staff` | `St. Mary's Hospital` | Referral rejection and clarification testing |
| `admin@demo.test` | `system_admin` | Global scope | System settings, user provisioning, audit inspection |
| `observer@demo.test` | `observer` | Global read-only | Audit log inspection, SLA analytics dashboard |

### 5.2 Scenario Hospitals
1. **City General Hospital:**
   - Status: `active`
   - Resources: Fresh (`confirmed`), ICU: 5/12, Cath lab & Cardiologist available.
   - Purpose: Ideal candidate for cardiac recommendation.
2. **Riverside Medical Center:**
   - Status: `active`
   - Resources: Stale (`> 150m` age), unverified.
   - Purpose: Validates freshness score penalty in recommendation algorithm.
3. **Northgate Clinic:**
   - Status: `active`
   - Resources: No cardiology specialty or cardiologist on call.
   - Purpose: Validates clinical eligibility filter (classified as ineligible for cardiac cases).
4. **St. Mary's Hospital:**
   - Status: `active`
   - Resources: Capable & fresh.
   - Purpose: Demo target for referral rejection / clarification workflow.
5. **Eastside Trauma Center:**
   - Status: `active`
   - Resources: ICU capacity count is `null` (`unknown` freshness).
   - Purpose: Validates fallback scoring when telemetry is partially absent.
6. **Harbor Hospital:**
   - Status: `closed`
   - Resources: Zero capacity.
   - Purpose: Demonstrates facility-level operational exclusion.
