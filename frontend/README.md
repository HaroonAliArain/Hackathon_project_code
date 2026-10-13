# EmergencyLink Frontend

Role-aware React and TypeScript web app for EmergencyLink's operations, hospital, ambulance, and administrator workflows.

## Run locally

Requirements: Node.js LTS, npm, and the backend running on `http://localhost:5000`.

```powershell
cd "D:\STUDY WORK\WEB Development\New folder\frontend"
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api/v1` requests to the backend. To use a different API base URL, copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL`.

## Main panels

- **Overview:** active case, referral, ambulance, and resource-freshness summary.
- **Emergencies:** create cases, request hospital recommendations, initiate referrals, and assign an available ambulance after destination confirmation.
- **Hospitals:** view capacity and freshness; hospital staff and administrators can update their permitted resources.
- **Referrals:** hospital staff can accept, reject, or request clarification on incoming referrals.
- **Ambulance fleet:** view fleet status and submit permitted status transitions.
- **Team & access:** authorized administrators can manage user accounts within backend-enforced scope.

## Architecture notes

- API access is isolated in `src/shared/api.ts`; UI code does not call `fetch` directly.
- Authentication state and session-scoped token handling live in `src/shared/AuthProvider.tsx`.
- Panels, shared components, and API types are separated into focused modules.
- Navigation is role-aware for usability. The backend remains authoritative for all authorization and record scope.
- API errors, loading states, empty states, and form validation feedback are shown explicitly.
- JWTs are kept in `sessionStorage`, not persistent browser storage. Use HTTPS in deployed environments.
- Demo data must be fictional. Do not enter patient names or other identifying information.

## Build

```powershell
npm run build
```
