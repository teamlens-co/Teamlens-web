# TeamLens Web Server 2

TeamLens is an employee productivity, attendance, and live screen viewing platform. This repository contains the web dashboard, Go REST API, WebSocket/WebRTC signaling service, desktop tracking agent, database schema, gateway configuration, and CI/CD workflows.

This README is written as the starting point for a new developer or AI agent such as Emily/OpenClaw. Read it from top to bottom before changing code.

## What TeamLens Does

TeamLens helps organizations manage:

- Manager/admin web dashboard.
- Employee desktop tracking agent.
- Clock-in and clock-out sessions.
- Attendance and office/remote classification.
- Activity telemetry such as keyboard and mouse activity.
- App, website, and domain usage tracking.
- Screenshots and screen recordings.
- Teams, invites, users, and productivity labels.
- Manual time requests.
- Live screen viewing through WebSocket/WebRTC signaling.
- Mobile companion/live viewing flows.

## Repository Map

```text
.
|-- backend-go/          Main REST API in Go using Chi and pgx
|-- backend-ws/          Socket.IO WebSocket/WebRTC signaling service
|-- frontend/            Next.js dashboard app
|-- agent/               Tauri desktop tracking agent
|-- nginx/               Local gateway config
|-- scripts/             Helper scripts
|-- schema.sql           Root PostgreSQL schema snapshot
|-- docker-compose.yml   Local multi-service stack
|-- .github/workflows/   GitHub Actions CI/CD workflows
|-- .env.example         Local environment template
|-- AGENTS.md            AI contributor guide with extra implementation notes
```

## High-Level Architecture

```text
Browser / Dashboard
        |
        | HTTP
        v
Nginx Gateway :80
        |
        |-- /api/* ---------> Go API :5000
        |                        |
        |                        v
        |                    PostgreSQL :5432 container / :5433 host
        |
        |-- /socket.io/* ---> WebSocket Service :4000
        |
        |-- / -------------> Next.js Frontend :3000

Desktop Agent
        |
        | REST telemetry/screenshots + Socket.IO live view
        v
Go API / WebSocket Service
```

Typical local URLs:

| Surface | URL |
| --- | --- |
| Gateway | `http://localhost` |
| Frontend direct | `http://localhost:3000` |
| Go API direct | `http://localhost:5000` |
| WebSocket direct | `http://localhost:4000` |
| PostgreSQL host port | `localhost:5433` |

Gateway routes:

| Route | Target |
| --- | --- |
| `/` and `/_next/*` | Next.js frontend |
| `/api/web/*` | Go manager/web API |
| `/api/agent/*` | Go desktop-agent API |
| `/api/mobile/*` | Go mobile API |
| `/socket.io/*` | Node WebSocket service |

## Main Product Flow

1. A manager signs up or logs in through the dashboard.
2. The manager creates teams and employee invites.
3. An employee accepts an invite or logs into the desktop agent.
4. The agent clocks in through the Go API.
5. The agent sends activity, usage, screenshots, and optional screen data.
6. The dashboard reads analytics from `/api/web/dashboard/*`.
7. For live view, manager and employee connect to `backend-ws`.
8. `backend-ws` validates JWTs, organization scope, roles, and live session state.
9. WebRTC offer/answer/ICE messages are relayed through Socket.IO.

## Prerequisites

Install these before working locally:

- Docker and Docker Compose.
- Go 1.22+.
- Node.js 20+ for backend-ws and frontend.
- Node.js 22+ is used by the agent GitHub Actions workflow.
- Rust and Tauri prerequisites if building the desktop agent.
- Git.

## Environment Setup

Create a local env file:

```bash
cp .env.example .env
```

Never commit real `.env` files. The repo ignores `.env` by default.

Important variables:

| Variable | Used By | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Go API, WS | PostgreSQL connection string |
| `JWT_SECRET` | Go API, WS | JWT signing and verification |
| `JWT_ACCESS_TTL` | Go API | Web access token lifetime |
| `JWT_AGENT_TTL` | Go API | Desktop agent token lifetime |
| `INVITE_TTL_HOURS` | Go API | Invite expiry window |
| `WEB_APP_URL` | Go API | Dashboard URL for links |
| `CORS_ORIGINS` | Go API, WS | Allowed browser origins |
| `UPLOAD_DIR` | Go API | Screenshot/recording storage |
| `NEXT_PUBLIC_API_URL` | Frontend | Browser API base URL |
| `NEXT_PUBLIC_WS_URL` | Frontend | Browser Socket.IO base URL |
| `WEBRTC_ICE_SERVERS` | WS, frontend build | STUN/TURN config JSON |
| `GOOGLE_PLACES_API_KEY` | Go API | Google Places office-location search |
| `AGENT_DOWNLOAD_URL` / `NEXT_PUBLIC_AGENT_DOWNLOAD_URL` | Frontend | Agent download URL |

Local Docker defaults are usually enough. For direct host execution, use `localhost:5433` for PostgreSQL.

## Quick Start With Docker

Start the full stack:

```bash
docker compose up --build -d
```

Subsequent starts:

```bash
docker compose up -d
```

Check health:

```bash
curl http://localhost/health
curl http://localhost/api/health
```

Open the dashboard:

```bash
http://localhost
```

Stop services:

```bash
docker compose down
```

Reset local database data:

```bash
docker compose down -v
docker compose up --build -d
```

## Running Services Individually

Start only PostgreSQL:

```bash
docker compose up -d postgres
```

Run Go API:

```bash
cd backend-go
go run ./cmd/server
```

Run WebSocket service:

```bash
cd backend-ws
npm install
npm run dev
```

Run frontend:

```bash
cd frontend
npm install
npm run dev
```

Run desktop agent:

```bash
cd agent
npm install
npm run tauri:dev
```

## Backend: Go REST API

Location:

```text
backend-go/
```

Important files:

| File | Purpose |
| --- | --- |
| `cmd/server/main.go` | Service wiring and route registry |
| `internal/config/config.go` | Environment config |
| `internal/database/database.go` | PostgreSQL connection |
| `internal/middleware/` | Auth, CORS, and response helpers |
| `internal/handlers/web/` | Manager/dashboard endpoints |
| `internal/handlers/agent/` | Desktop agent endpoints |
| `internal/handlers/mobile/` | Mobile endpoints |
| `internal/services/` | Business logic and DB queries |
| `internal/models/models.go` | Shared Go models |

Run checks:

```bash
cd backend-go
go test ./...
```

Key route groups:

| Prefix | Owner |
| --- | --- |
| `/api/web/auth/*` | Web login, signup, current user |
| `/api/web/dashboard/*` | Analytics, attendance, usage reports |
| `/api/web/locations/*` | Office locations and Google Places search |
| `/api/web/teams/*` | Teams and members |
| `/api/web/invites/*` | Invite creation and acceptance |
| `/api/agent/auth/*` | Desktop agent login/token |
| `/api/agent/clock-in` | Start work session |
| `/api/agent/clock-out` | End work session |
| `/api/agent/activity` | Activity telemetry |
| `/api/agent/screenshots` | Screenshot upload/list/fetch |

Backend conventions:

- Keep route registration centralized in `cmd/server/main.go` unless intentionally refactoring routers.
- Handlers parse requests and format responses.
- Services hold business rules and database queries.
- Use existing `middleware.Success` and `middleware.Error` helpers.
- Preserve alias routes while frontend/agent/mobile still depend on them.
- Never return cross-organization data.
- Use transactions for multi-step changes when consistency matters.

## Office Location Search

Office address search is handled by:

```text
GET /api/web/locations/search?q=<query>
```

The backend uses `GOOGLE_PLACES_API_KEY` when configured. If the key is missing, it falls back to searching saved `office_locations` in the database.

Google Places setup:

1. Enable billing in Google Cloud.
2. Enable Places API (New).
3. Create an API key.
4. Restrict the key to Places API and backend/server usage.
5. Add it to `.env` or server environment:

```env
GOOGLE_PLACES_API_KEY=your-key
```

Do not expose this key as a `NEXT_PUBLIC_*` frontend variable.

## WebSocket Service

Location:

```text
backend-ws/
```

Important files:

| File | Purpose |
| --- | --- |
| `src/index.ts` | HTTP health server and Socket.IO registration |
| `src/socket.ts` | Live screen auth, session state, and signaling |
| `src/config/env.ts` | Environment parsing |
| `src/shared/auth/` | JWT and token helpers |
| `src/shared/db/prisma.ts` | Prisma client |
| `prisma/schema.prisma` | Prisma schema |
| `prisma/migrations/` | DB migrations |

Run checks:

```bash
cd backend-ws
npm install
npm run build
```

WebSocket conventions:

- Keep this service focused on live presence and signaling.
- Validate socket JWT and organization/role permissions before emitting events.
- Keep `live_screen_sessions` audit rows accurate.
- Current in-memory session state is not horizontally scalable; Redis or shared state is needed for multiple WS instances.

## Frontend Dashboard

Location:

```text
frontend/
```

Stack:

- Next.js App Router.
- React.
- TypeScript.
- Tailwind CSS.
- lucide-react icons.

Important files:

| File | Purpose |
| --- | --- |
| `app/` | App Router pages and layouts |
| `app/dashboard/layout.tsx` | Authenticated dashboard shell |
| `contexts/AuthContext.tsx` | Web auth state |
| `components/` | Reusable UI components |
| `app/download/agent/route.ts` | Agent download endpoint |
| `app/globals.css` | Global theme |

Run checks:

```bash
cd frontend
npm install
npm run lint
npm run build
```

Frontend conventions:

- Keep pages focused on composition.
- Move reusable UI to `frontend/components/`.
- Avoid production-facing mock data.
- Keep API base URLs controlled by environment variables.
- Use permission-aware rendering for manager/admin/employee actions.
- Keep loading, empty, and error states consistent.

## Desktop Agent

Location:

```text
agent/
```

Stack:

- Tauri.
- React frontend.
- Rust native commands.

Important files:

| File | Purpose |
| --- | --- |
| `src/App.tsx` | Agent UI, auth, clocking, sync, screenshot upload |
| `src/liveScreen.ts` | Employee-side live screen streaming |
| `src-tauri/src/lib.rs` | Rust native commands |
| `src-tauri/tauri.conf.json` | Development Tauri config |
| `src-tauri/tauri.release.conf.json` | Release/updater config |
| `AGENT_AUTO_UPDATE.md` | Auto-update notes |
| `DEPLOYMENT.md` | Agent deployment notes |

Run locally:

```bash
cd agent
npm install
npm run tauri:dev
```

Build release:

```bash
cd agent
npm run tauri:release
```

Agent environment:

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Go API or gateway URL |
| `VITE_WEB_URL` | Dashboard URL |
| `VITE_WS_URL` | Socket.IO URL |
| `VITE_WEBRTC_ICE_SERVERS` | WebRTC STUN/TURN JSON |

Privacy-sensitive rules:

- Be explicit about what is captured and when.
- Store local tokens through Tauri/Rust commands, not browser localStorage.
- Keep background sync resilient when the backend is offline.
- Add native capabilities in Rust with small typed Tauri commands.

## Mobile / Mobile Live

The mobile app structure may exist in related branches or deployments. This repo currently includes frontend mobile live routes and mobile API route placeholders.

Mobile live page:

```text
frontend/app/mobile-live/page.tsx
```

Mobile API prefix:

```text
/api/mobile/*
```

When testing on real devices, use LAN-accessible URLs instead of `localhost`.

## Database

Current schema sources:

| Source | Purpose |
| --- | --- |
| `schema.sql` | Root SQL schema snapshot |
| `backend-ws/prisma/schema.prisma` | Prisma schema for WS service |
| `backend-ws/prisma/migrations/` | Applied migrations |

When changing database shape:

1. Add a migration.
2. Update Go service queries and models.
3. Update Prisma schema if WS service needs the table.
4. Regenerate Prisma client when needed.
5. Update frontend/agent/mobile types if response shapes change.
6. Add seed data only when it helps local development.

## Screenshots And Uploads

Screenshots are uploaded by the agent to:

```text
POST /api/agent/screenshots
```

Local Docker stores uploaded files in the `uploads_data` volume at `/app/uploads` inside the Go API container.

Important implementation notes:

- Files are written under `UPLOAD_DIR/screenshots/<date>/`.
- Screenshot DB records point to the stored file path.
- `safeUploadPath()` in `backend-go/internal/handlers/agent/screenshot_handler.go` prevents path traversal when serving files.
- Managers can view employee screenshots; employees can only view their own.

## Testing And Verification Checklist

Before pushing to `main`, run:

```bash
cd backend-go
go test ./...
```

```bash
cd backend-ws
npm run build
```

```bash
cd frontend
npm run lint
npm run build
```

Useful repository checks:

```bash
git status --short
git diff --check
git diff --cached --check
git diff --name-only --diff-filter=U
```

There should be no unresolved merge conflicts before pushing.

## CI/CD Workflows

Workflows live in:

```text
.github/workflows/
```

### Server Deploy

File:

```text
.github/workflows/deploy.yml
```

Triggers:

- Push to `main`.
- Manual `workflow_dispatch`.
- Ignores agent-only, mobile-only, and markdown-only changes.

Required GitHub Secrets:

| Secret | Purpose |
| --- | --- |
| `VPS_HOST` | Deployment server host |
| `VPS_USER` | SSH user |
| `VPS_SSH_KEY` | SSH private key |
| `NEXT_PUBLIC_API_URL` | Frontend API URL at build time |
| `NEXT_PUBLIC_WS_URL` | Frontend WS URL at build time |
| `NEXT_PUBLIC_WEBRTC_ICE_SERVERS` | Frontend WebRTC ICE JSON |
| `NEXT_PUBLIC_AGENT_DOWNLOAD_URL` | Agent download URL |

The workflow builds and runs:

| Container | Host Port | Container Port |
| --- | --- | --- |
| Go API test | `5002` | `5000` |
| WebSocket test | `4001` | `4000` |
| Frontend test | `3002` | `3000` |

### Agent Build And Release

File:

```text
.github/workflows/agent-build.yml
```

Triggers:

- Push to `main` when `agent/**` changes.
- Manual `workflow_dispatch`.

Required GitHub Secrets:

| Secret | Purpose |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Tauri updater signing key |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Signing key password |
| `AGENT_VITE_API_URL` | Agent API URL |
| `AGENT_VITE_WEB_URL` | Dashboard URL |
| `AGENT_VITE_WEBRTC_ICE_SERVERS` | Agent ICE server JSON, including TURN credentials |

Do not hardcode TURN credentials, API keys, JWT secrets, SSH keys, or signing keys in workflows.

## Deployment Readiness Checklist

Before merging or pushing to `main`:

1. `git status --short` has no `UU` files.
2. No real secrets are present in tracked files.
3. `.env` is not tracked.
4. `go test ./...` passes in `backend-go`.
5. `npm run build` passes in `backend-ws`.
6. `npm run lint` and `npm run build` pass in `frontend`.
7. GitHub Secrets are configured for deploy and agent workflows.
8. Frontend build args point at production URLs, not localhost.
9. `GOOGLE_PLACES_API_KEY` is present on the backend server if office-location search should use Google.
10. Nginx config on the server routes to the ports used by the workflow.

## Security Notes

- Never commit `.env`, private keys, signing keys, database passwords, JWT secrets, or API keys.
- Google Places API key belongs on the backend, not in `NEXT_PUBLIC_*`.
- TURN credentials should live in GitHub Secrets or server env.
- JWT tokens should be treated as sensitive.
- Screenshot and live screen features are privacy-sensitive; keep authorization checks strict.
- When serving uploaded files, always keep path traversal protection.

## Common Troubleshooting

### Location search returns no useful results

Check:

- `GOOGLE_PLACES_API_KEY` exists in the Go API environment.
- Places API (New) is enabled in Google Cloud.
- Backend container has been rebuilt after code/env changes.
- Call `/api/web/locations/search?q=delhi` with a valid manager token.

### Frontend points to localhost in production

The frontend reads `NEXT_PUBLIC_*` values at build time. Rebuild the frontend image with production build args.

### Backend compiles locally but Docker still behaves old

Rebuild the image:

```bash
docker compose up --build -d backend-go
```

### WebSocket live view fails outside local network

Check:

- `WEBRTC_ICE_SERVERS` contains reachable STUN/TURN servers.
- TURN credentials are valid.
- `NEXT_PUBLIC_WS_URL` and `VITE_WS_URL` use the correct protocol and domain.
- Backend WS service can validate JWTs with the same `JWT_SECRET` as Go API.

### Screenshots do not load

Check:

- `UPLOAD_DIR` matches where files are written.
- The upload volume is mounted in Docker.
- The screenshot row `file_path` points inside `UPLOAD_DIR`.
- Manager/employee permissions are valid.

## Guide For Emily / OpenClaw / AI Contributors

Start every task with this sequence:

1. Read `README.md`.
2. Read `AGENTS.md`.
3. Run `git status --short`.
4. Identify the owning app: `backend-go`, `backend-ws`, `frontend`, or `agent`.
5. Find the route, socket event, screen, or native command involved.
6. Trace the full data flow before editing.
7. Make the smallest change that fits existing patterns.
8. Run the relevant checks.
9. Summarize changed files and verification results.

Ownership guide:

| Task Type | Start Here |
| --- | --- |
| REST API behavior | `backend-go/cmd/server/main.go` |
| Dashboard UI | `frontend/app/` |
| Auth state | `frontend/contexts/AuthContext.tsx` |
| Desktop tracking | `agent/src/App.tsx` |
| Native desktop capability | `agent/src-tauri/src/lib.rs` |
| Live screen signaling | `backend-ws/src/socket.ts` |
| Database shape | `schema.sql` and `backend-ws/prisma/` |
| CI/CD | `.github/workflows/` |

Rules for safe AI changes:

- Do not overwrite user changes.
- Do not remove routes unless callers are updated.
- Do not add mock production data.
- Do not commit secrets.
- Do not weaken auth checks.
- Do not bypass organization scoping.
- Do not hand-roll path/file serving without traversal checks.
- Prefer existing helpers and patterns over new abstractions.

## Useful Commands

```bash
# Repo state
git status --short
git diff --check
git diff --cached --check

# Backend
cd backend-go && go test ./...

# WebSocket
cd backend-ws && npm run build

# Frontend
cd frontend && npm run lint && npm run build

# Docker
docker compose up --build -d
docker compose logs -f backend-go
docker compose logs -f backend-ws
docker compose logs -f frontend
```

## Current Improvement Backlog

Practical next improvements:

- Add root `docs/` for architecture, API contracts, local dev, testing, deployment, and release notes.
- Add OpenAPI documentation for Go REST routes.
- Add Go tests for auth, clock-in/out, activity aggregation, screenshots, teams, invites, and manual time.
- Add Playwright smoke tests for dashboard login, invite flow, live view, and settings.
- Add a typed frontend API client.
- Split large dashboard and agent files into feature modules.
- Add consistent loading, empty, and error states.
- Move live session state from memory to Redis or another shared store before horizontal WS scaling.
- Add sample seed data for reproducible dashboard states.
- Document Socket.IO live-view events in `docs/live-view.md`.
