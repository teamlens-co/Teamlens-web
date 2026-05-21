# TeamLens AI Contributor Guide

This file is the first context another AI or developer should read before changing TeamLens.
It explains what the project is, where each part lives, and how to build on it safely.

## Product Summary

TeamLens is an employee productivity and attendance platform with four user-facing surfaces:

- Web dashboard for managers and admins.
- Desktop tracking agent for employees.
- Mobile companion app for manager/employee views.
- Live screen viewing through a WebSocket/WebRTC signaling service.

The system tracks clock-in/clock-out sessions, activity telemetry, app/domain usage,
screenshots, screen recordings, teams, invites, office locations, attendance, productivity,
manual time requests, and live screen sessions.

## High-Level Architecture

- `backend-go/`: main REST API, written in Go using Chi and pgx.
- `backend-ws/`: Socket.IO service for live screen WebRTC signaling and auth validation.
- `frontend/`: Next.js dashboard app.
- `agent/`: Tauri desktop app, React frontend plus Rust native commands.
- `mobile/`: Expo React Native app.
- `nginx/`: local gateway config for routing frontend, API, and WebSocket traffic.
- `schema.sql` and `backend-ws/prisma/`: database schema and Prisma migrations used by the WS service.
- `docker-compose.yml`: local multi-service stack.

Typical local routes:

- Web app: `http://localhost:3000`
- Gateway: `http://localhost`
- Go API direct: `http://localhost:5000`
- WebSocket direct: `http://localhost:4000`
- PostgreSQL host port: `5433`, container port: `5432`

Through the gateway:

- `/api/web/*` routes to the Go web/manager API.
- `/api/agent/*` routes to the Go desktop-agent API.
- `/api/mobile/*` routes to the Go mobile API.
- `/socket.io/*` routes to the Node WebSocket service.
- `/` and `/_next/*` route to the Next.js frontend.

## Main Data Flow

1. A manager signs up or logs in from `frontend/` or `mobile/`.
2. The manager creates teams/invites and can generate employee/agent access.
3. An employee logs into the desktop `agent/`.
4. The agent clocks in through `/api/agent/clock-in` or `/api/agent/sessions/clock-in`.
5. The agent periodically sends activity, usage, and screenshots to the Go API.
6. The dashboard reads analytics through `/api/web/dashboard/*` and related routes.
7. For live view, manager and employee agent connect to `backend-ws/` with JWT auth.
8. `backend-ws/` validates permissions, creates/audits live sessions, and relays WebRTC offer/answer/ICE messages.

## Backend: Go REST API

Important files:

- `backend-go/cmd/server/main.go`: service wiring and route registry.
- `backend-go/internal/config/config.go`: environment config.
- `backend-go/internal/database/database.go`: PostgreSQL connection.
- `backend-go/internal/middleware/`: CORS, auth, response helpers.
- `backend-go/internal/handlers/web/`: manager/web endpoints.
- `backend-go/internal/handlers/agent/`: desktop agent endpoints.
- `backend-go/internal/handlers/mobile/`: mobile endpoints.
- `backend-go/internal/services/`: business logic and database queries.
- `backend-go/internal/models/models.go`: shared Go models.

Run locally:

```bash
cd backend-go
go run ./cmd/server
```

Build/check:

```bash
cd backend-go
go test ./...
```

Backend conventions:

- Keep route definitions centralized in `cmd/server/main.go` unless the router is later refactored intentionally.
- Put request parsing and HTTP response formatting in handlers.
- Put business rules and database reads/writes in services.
- Use the existing `middleware.Success` / response helpers for consistent API responses.
- Preserve alias routes only when the frontend/agent/mobile still depend on them.
- Any schema change should be reflected in migrations and in all services that read/write that table.

## WebSocket Service

Important files:

- `backend-ws/src/index.ts`: HTTP health server and Socket.IO registration.
- `backend-ws/src/socket.ts`: live screen authorization, session state, audit updates, and WebRTC signaling.
- `backend-ws/src/config/env.ts`: environment config.
- `backend-ws/src/shared/auth/`: JWT and token hash helpers.
- `backend-ws/src/shared/db/prisma.ts`: Prisma client.
- `backend-ws/prisma/schema.prisma`: Prisma schema.
- `backend-ws/prisma/migrations/`: DB migrations.

Run locally:

```bash
cd backend-ws
npm install
npm run dev
```

Build/check:

```bash
cd backend-ws
npm run build
```

WebSocket conventions:

- This service should stay focused on live presence/signaling, not general REST APIs.
- Always validate the socket token and organization/role permissions before emitting live-view events.
- Keep `live_screen_sessions` audit rows accurate when sessions start, activate, end, error, or expire.
- Be careful with in-memory session state; if the app scales horizontally, this needs Redis or another shared state layer.

## Frontend Dashboard

Important files:

- `frontend/app/`: Next.js App Router pages and layouts.
- `frontend/app/dashboard/layout.tsx`: main authenticated dashboard shell/sidebar.
- `frontend/contexts/AuthContext.tsx`: web auth state.
- `frontend/components/`: reusable dashboard components.
- `frontend/app/download/agent/route.ts`: agent download route.
- `frontend/app/globals.css`: global theme and Tailwind CSS.

Run locally:

```bash
cd frontend
npm install
npm run dev
```

Build/check:

```bash
cd frontend
npm run lint
npm run build
```

Frontend conventions:

- This app uses Next.js App Router, React, TypeScript, Tailwind CSS, and lucide-react.
- Prefer shared components in `frontend/components/` for repeated controls, charts, filters, cards, and tables.
- Keep dashboard pages focused on page composition; move fetch helpers, formatting, and reusable UI out of large page files.
- Avoid mock dashboard data in production-facing components. If placeholder data is needed, label it clearly or gate it to development.
- Keep API base URLs controlled by environment variables.

## Desktop Agent

Important files:

- `agent/src/App.tsx`: desktop agent UI, auth, clocking, activity sync, screenshot upload.
- `agent/src/liveScreen.ts`: employee-side live screen streaming.
- `agent/src-tauri/src/lib.rs`: Rust native commands.
- `agent/src-tauri/tauri.conf.json`: Tauri config.
- `agent/src-tauri/tauri.release.conf.json`: release config.
- `agent/AGENT_AUTO_UPDATE.md`: update flow notes.
- `agent/DEPLOYMENT.md`: deployment notes.

Run locally:

```bash
cd agent
npm install
npm run tauri:dev
```

Build:

```bash
cd agent
npm run tauri:release
```

Required environment:

- `VITE_API_URL`: base URL for Go API or gateway, for example `http://localhost:5000` or `http://localhost`.
- `VITE_WEB_URL`: dashboard URL.
- `VITE_WS_URL`: Socket.IO URL, usually `http://localhost:4000` direct or gateway URL.

Agent conventions:

- Treat the desktop agent as privacy-sensitive software.
- Be explicit about what is captured and when: activity counts, app/window info, URLs/domains, screenshots, live screen.
- Keep local token storage in Tauri/Rust commands, not browser localStorage.
- Any new native capability should be implemented in Rust and exposed through a small, typed Tauri command.
- Prefer resilient background sync: tracking should not crash just because the backend is temporarily unavailable.

## Mobile App

Important files:

- `mobile/App.js`: app root.
- `mobile/src/navigation/AppNavigator.tsx`: authenticated navigation and tabs.
- `mobile/src/contexts/AuthContext.tsx`: mobile auth state.
- `mobile/src/services/api.ts`: mobile API client.
- `mobile/src/screens/`: mobile screens.
- `mobile/src/components/IosKit.tsx`: reusable mobile UI primitives/icons.
- `mobile/src/theme.ts`: mobile theme tokens.

Run locally:

```bash
cd mobile
npm install
npm start
```

Mobile API configuration:

- Use `EXPO_PUBLIC_API_URL` when testing against a real device.
- If not set, `mobile/src/services/api.ts` tries to infer the Metro host and use `http://<metro-host>/api`.
- Android emulator fallback is `http://10.0.2.2/api`.

Mobile conventions:

- Keep network calls in `src/services/api.ts` or a dedicated services folder.
- Keep screen components focused on UI and orchestration.
- Reuse theme tokens from `src/theme.ts`; avoid one-off colors scattered through screens.
- Test on real device dimensions, not only Expo web.

## Database

Current database sources:

- `schema.sql`: root SQL schema snapshot.
- `backend-ws/prisma/schema.prisma`: Prisma model source for the WS service.
- `backend-ws/prisma/migrations/`: applied migrations.

When changing database shape:

- Add a migration.
- Update Go service queries/models.
- Update Prisma schema and generate client if the WS service needs the table.
- Update frontend/mobile/agent types if response shapes change.
- Add seed data only when it helps local development and does not hide missing setup.

## Docker Workflow

Start the whole stack:

```bash
docker compose up --build -d
```

Start only database:

```bash
docker compose up -d postgres
```

Check gateway health:

```bash
curl http://localhost/health
curl http://localhost/api/health
```

## Environment Variables

Root `.env.example` is the reference for Docker/local environment. Common variables:

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_ACCESS_TTL`
- `JWT_AGENT_TTL`
- `INVITE_TTL_HOURS`
- `WEB_APP_URL`
- `CORS_ORIGINS`
- `UPLOAD_DIR`
- `GOOGLE_PLACES_API_KEY`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_WS_URL`
- `WEBRTC_ICE_SERVERS`
- `AGENT_DOWNLOAD_URL`
- `EXPO_PUBLIC_API_URL`

Never commit real secrets in `.env`.

## Suggested Development Order For New AI Work

1. Read this file.
2. Read `README.md`.
3. Check `git status --short` and avoid overwriting user changes.
4. Identify which app owns the requested behavior.
5. Find the API route in `backend-go/cmd/server/main.go` or socket event in `backend-ws/src/socket.ts`.
6. Trace data through service, handler, client API helper, and UI.
7. Make the smallest change that fits existing patterns.
8. Run the relevant build/test/lint command.
9. Summarize changed files and verification results.

## Current Project Improvement Backlog

Use this as a practical cleanup roadmap before giving the project to a manager or another AI.

### Repository Structure

- Add a root `docs/` folder for architecture, API contracts, setup, deployment, and release notes.
- Move app-specific docs into each app, but keep root docs as the index.
- Remove accidental files such as empty scratch files and timestamp backup files after confirming they are not needed.
- Standardize naming: use one spelling, preferably `teamlens`, across folder names, package names, Docker names, and docs.
- Add root scripts or a Makefile/task runner for common commands like `dev`, `build`, `test`, `lint`, and `format`.
- Consider npm/pnpm workspaces only if you want one command to manage `frontend`, `backend-ws`, `agent`, and `mobile`.
- Add `.editorconfig` and consistent formatter configs for Go, TypeScript, Rust, and React Native.
- Keep generated files, build outputs, and temp files out of Git.

### Backend Improvements

- Add Go tests for auth, clock-in/out, activity aggregation, screenshots, teams, invites, and manual time requests.
- Split `backend-go/cmd/server/main.go` route setup into smaller router files when routes keep growing.
- Add OpenAPI documentation for `/api/web`, `/api/agent`, and `/api/mobile`.
- Create request/response DTO structs per handler instead of relying on loosely shaped maps.
- Add centralized validation for dates, UUIDs, pagination, roles, and organization scoping.
- Add structured error codes so frontend/mobile can show better error states.
- Add DB transaction boundaries for multi-step operations such as invite acceptance, clock changes, and team membership updates.
- Add indexes for frequent filters such as organization, user, date range, session, and captured_at.
- Add rate limits for login, invite acceptance, agent auth, screenshot upload, and live view requests.
- Add a background cleanup job for expired tokens, stale sessions, and old upload files.

### WebSocket/Live View Improvements

- Move live session state from memory to Redis or Postgres advisory/session state if multiple WS instances will run.
- Add event schema validation for all socket payloads.
- Add reconnect/resume behavior for active live screen sessions.
- Add telemetry for session requested, accepted, ended, denied, expired, and failed.
- Add tests for manager permission checks and employee clocked-in checks.
- Document every Socket.IO event and payload in `docs/live-view.md`.

### Frontend Improvements

- Create a typed API client instead of repeating fetch logic in pages.
- Extract large dashboard pages into feature folders such as `features/attendance`, `features/live`, and `features/team`.
- Replace mock notifications and development-only placeholder routes with real data or clear dev gates.
- Add loading, empty, and error states consistently across every dashboard page.
- Add permission-aware rendering so managers/admins/employees see only valid actions.
- Add reusable table, stat card, filter, modal, and chart components.
- Add Playwright smoke tests for sign-in, dashboard load, invite flow, team view, live view start, and settings.
- Add unit tests for date filters, formatting helpers, and analytics transforms.
- Review responsive layout for dashboard pages on tablet and narrow desktop widths.

### Desktop Agent Improvements

- Split `agent/src/App.tsx` into smaller modules: auth, clocking, telemetry sync, screenshots, live screen, update checks, and UI.
- Add a local sync queue for activity/screenshot metadata when offline.
- Add clearer privacy controls and visible capture state for screenshots/live streaming.
- Add tray behavior, auto-start settings, and idle detection settings if required by product.
- Add platform-specific tests or manual QA checklist for Windows permissions, screen capture, active window detection, and updates.
- Avoid hardcoded external fallback services for location unless product/legal approves them.
- Add release signing, update manifest validation, and rollback instructions.

### Mobile Improvements

- Decide whether mobile is manager-only, employee-only, or both, then shape navigation and permissions around that.
- Add typed navigation params instead of generic navigators.
- Add persistent auth restore using secure storage and token refresh/expiry handling.
- Build mobile-specific endpoints under `/api/mobile/*` instead of reusing web endpoints everywhere.
- Add offline and retry states for dashboards, attendance, and alerts.
- Add real push notifications for alerts if mobile is expected to notify managers.
- Add screen-level loading/error/empty states.
- Test on Android emulator, iOS simulator, and at least one real device on the same LAN as the backend.

### AI Friendliness

- Keep this `AGENTS.md` updated whenever architecture or commands change.
- Add `docs/api.md` with route purpose, auth type, request body, response body, and owning UI.
- Add `docs/data-model.md` with table meanings and relationships.
- Add `docs/local-dev.md` with exact setup steps for Docker and non-Docker development.
- Add `docs/testing.md` with test commands and what each app currently covers.
- Add small feature-level READMEs for complex areas: live view, screenshots, activity calculation, manual time, and agent updates.
- Add a stable sample dataset/seed script so AI can reproduce dashboard states.
- Add screenshots or short screen descriptions for major frontend/mobile/agent screens.
