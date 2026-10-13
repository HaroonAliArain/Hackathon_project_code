# EmergencyLink

EmergencyLink is a role-aware web application for coordinating fictional emergency cases, hospital resource reports, referrals, and ambulance assignments. It combines a React/TypeScript frontend with a Node.js, Express, and MongoDB backend.

> **Prototype notice:** EmergencyLink is an operational coordination demo, not a medical device or clinical decision system. It does not diagnose or triage patients. Recommendations require human review and hospital acceptance. Use fictional data only; do not enter patient names or identifying information.

## Project layout

```text
New folder/
├── backend/                 # Express REST API, MongoDB models, Socket.IO, and tests
│   ├── src/
│   ├── tests/
│   ├── docs/api-contract.md
│   ├── .env.example
│   └── package.json
├── frontend/                # React + TypeScript role-based web client
│   ├── src/
│   ├── .env.example
│   └── package.json
└── README.md
```

The separate `Hackathon_project_code/` folder is not part of this app's local setup instructions.

## Features

### Frontend panels

- **Overview:** active emergency count, pending referrals, available ambulances, hospital count, resource freshness, and recent cases.
- **Emergencies:** register an operational case, request ranked hospital recommendations, create referrals, and assign an available ambulance after a destination is confirmed.
- **Hospitals & resources:** inspect facilities and freshness reports; authorized staff can submit resource reports and confirm current figures; system administrators can add hospitals.
- **Referral queue:** review incoming requests; hospital staff can accept, reject, or request clarification.
- **Ambulance fleet:** view vehicle status and make permitted workflow status changes; coordinators and system administrators can add vehicles.
- **Team & access:** system or hospital administrators can create permitted user accounts and enable/disable accounts.

The navigation is role-aware to improve usability. The backend is responsible for actual authorization and record scoping.

### Backend capabilities

- JWT login, active-account checking, password hashing, role-based access, and hospital/ambulance scoping.
- Emergency, hospital, resource snapshot, referral, ambulance, assignment, audit, and sync-event models.
- Freshness is computed on the server from the latest resource report and verification timestamps.
- Recommendation adapter and in-process ranking engine; destination confirmation happens only after referral acceptance.
- HTTP API with consistent success/error envelopes, request validation, rate limits, security middleware, and Socket.IO support.
- Seed data for fictional demo facilities, vehicles, cases, and accounts.

For the detailed request/response and event contract, see [backend/docs/api-contract.md](./backend/docs/api-contract.md).

## Requirements

- Node.js and npm
- MongoDB connection: local MongoDB or an authorized MongoDB Atlas URI

## Run locally on Windows

Open **two PowerShell terminals** from this project directory.

### 1. Configure and start the backend

```powershell
cd .\backend
npm install
Copy-Item .env.example .env
```

Edit `backend\.env` with your MongoDB URI and a private, strong `JWT_SECRET`. The server requires both `MONGODB_URI` and `JWT_SECRET`; never commit `.env` or share its contents.

Operational emails are optional. Configure `APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` in `backend\.env` using credentials from your SMTP provider. For example, use port `587` with `SMTP_SECURE=false` for STARTTLS or port `465` with `SMTP_SECURE=true` for implicit TLS. Referral outcome notifications go to the original requester; ambulance assignment/status notifications go to the assigning user and active staff assigned to the vehicle. They contain operational references only, not patient details. Delivery failures are logged without undoing the underlying workflow.

Stale-resource reminders are disabled by default. To turn them on, set `RESOURCE_REMINDERS_ENABLED=true`; the checker runs every 15 minutes and sends each affected hospital's active staff/admin users at most one reminder per 24 hours while resources remain stale. The stale age threshold follows `RESOURCE_STALE_AFTER` (default 120 minutes). Reminders are stored in MongoDB to suppress repeats across restarts. Keep the scheduler on one backend instance for this prototype.

To load the fictional demo records, run:

```powershell
npm run seed
```

> **Warning:** The seed script clears and recreates data in the MongoDB database configured by `MONGODB_URI`. Use a dedicated local/demo database only. Do not run it against data you need to keep.

Start the API:

```powershell
npm run dev
```

The default backend URL is `http://localhost:5000`. Health check:

```text
GET http://localhost:5000/api/v1/health
```

### 2. Start the frontend

In a second terminal:

```powershell
cd .\frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api/v1` requests to `http://localhost:5000`. To use another API base URL, copy `frontend\.env.example` to `frontend\.env.local` and set `VITE_API_BASE_URL`.

## Demo accounts

After loading the seed data, the default development password is **`Demo@12345`** for the accounts below. This password is for local fictional demo data only. Set `SEED_PASSWORD` before seeding if you need a different password. Do not use these accounts or the default password on a public deployment.

| Perspective | Email |
|---|---|
| Coordinator | `coordinator@demo.test` |
| Ambulance staff (AMB-01) | `amb1@demo.test` |
| Hospital staff (City General) | `city.staff@demo.test` |
| Hospital staff (Riverside) | `riverside.staff@demo.test` |
| Hospital staff (St. Mary's) | `stmarys.staff@demo.test` |
| System administrator | `admin@demo.test` |
| Observer (read-only) | `observer@demo.test` |

The seed data does not include a hospital administrator account. A system administrator can create one from Team & Access.

## API overview

Base path: `/api/v1`

| Area | Main routes |
|---|---|
| Health | `GET /health` via `/api/v1/health` |
| Authentication | `POST /auth/login`, `GET /auth/me` |
| Overview and analytics | `GET /dashboard/summary`, `GET /analytics/metrics` |
| Emergencies | `GET/POST /emergencies`, `GET /emergencies/:id`, `PATCH /emergencies/:id/status` |
| Hospitals | `GET/POST /hospitals`, `GET /hospitals/:id/resources`, `PUT /hospitals/:id/resources`, `POST /hospitals/:id/resources/confirm` |
| Recommendations | `POST /recommendations` |
| Referrals | `GET/POST /referrals`, `PATCH /referrals/:id/respond`, `PATCH /referrals/:id/clarify` |
| Ambulances | `GET/POST /ambulances`, `PATCH /ambulances/:id/status` |
| Assignments | `GET/POST /assignments`, `PATCH /assignments/:id/status` |
| Users | `GET/POST /users`, `PATCH /users/:id` |
| Audit | `GET /audit-events` |
| Offline sync | `POST /sync/events`, `GET /sync/conflicts`, `POST /sync/conflicts/:id/resolve` |

Most endpoints require a JWT bearer token. Refer to the API contract for role requirements, payload schemas, state transitions, and Socket.IO events.

## Roles

- `coordinator`: manages emergency coordination, recommendations, referrals, and dispatch.
- `ambulance_staff`: accesses assigned ambulance operations and permitted cases.
- `hospital_staff`: works on referrals and resource reports for their hospital.
- `hospital_admin`: manages hospital staff and scoped hospital workflows.
- `system_admin`: manages system-wide accounts and facilities.
- `observer`: read-only operational views.

The backend enforces permissions; hiding a button or route in the frontend is not a security boundary.

## Tests and production build

Run the backend test suite:

```powershell
cd .\backend
npm test
```

The suite covers API authorization, authentication, state-machine and freshness logic, recommendations, and a mocked workflow.

Build the frontend:

```powershell
cd .\frontend
npm run build
```

## Security and deployment notes

- `.env` and `.env.local` are ignored by Git; keep credentials and JWT secrets private.
- The login endpoint is rate-limited; local demo retries can still trigger a temporary rate limit.
- Use HTTPS and a strong, unique secret in any hosted environment. Restrict MongoDB network access and use a least-privilege database user.
- Change the seed password before exposing a demo environment publicly; never seed a database containing data you need to preserve.
- The prototype has not been represented as clinically validated or production-ready. Review access-control behavior, offline synchronization, real-time authorization, monitoring, and deployment configuration before any real-world or public use.

## Additional notification ideas

The first email is sent when a hospital accepts a referral. Useful follow-ups, in priority order, are:

1. Notify the requester when a referral is rejected or clarification is requested. **Implemented.**
2. Notify the assigning user and assigned ambulance staff when an ambulance is assigned or its journey status changes. **Implemented.**
3. Send hospital staff a reminder when resource reports become stale, once daily by default. **Implemented; opt-in via environment setting.**
4. Send account invitations and password-reset links rather than sharing temporary passwords.
5. Offer an opt-in daily operations summary for coordinators and administrators.

For urgent operational events, keep in-app updates as the primary channel and treat email as a supplementary notification.
