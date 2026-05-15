# TeamLens v2 — Microservice Architecture

## Architecture

```
          ┌──────────────┐
          │   Gateway     │  ← Nginx (port 80)
          │  (nginx:80)   │
          └──────┬───────┘
                 │
        ┌────────┴────────────────┐
        │                         │
   ┌────▼─────┐            ┌─────▼──────┐
   │  Go API   │            │   Node WS   │
   │  (REST)   │            │ (Socket.IO) │
   │ port 8080 │            │ port 4000   │
   └────┬──────┘            └─────┬───────┘
        │                         │
        └──────────┬──────────────┘
                   │
            ┌──────▼──────┐
            │  PostgreSQL  │
            │  (port 5432) │
            └─────────────┘
```

## Services

| Service | Internal Port | Gateway Route | Tech Stack |
|---------|---------------|---------------|------------|
| **Gateway** | 80 | — | Nginx |
| **Go API** | 8080 | `/api/*` | Go + Chi + pgx |
| **WS Service** | 4000 | `/socket.io/*` | Node + Socket.IO + Prisma |
| **Frontend** | 3000 | `/` and `/_next/*` | Next.js |
| **Postgres** | 5432 | — | PostgreSQL 16 |

## Quick Start

### Prerequisites
- Docker & Docker Compose

### 1. Setup Environment
```bash
cp .env.example .env
# Edit .env if needed (defaults work for local dev)
```

### 2. Start All Services
```bash
# First time / after code changes:
docker compose up --build -d

# Subsequent starts:
docker compose up -d
```

### 3. Verify
```bash
# Health check (via gateway)
curl http://localhost/health

# Go API health
curl http://localhost/api/health

# Frontend
open http://localhost
```

## Desktop Agent

The desktop agent is a **Tauri app** (React + Rust) located in the `agent/` directory.

### Building the Agent
```bash
cd agent
npm install
npm run tauri build
```

### Agent Configuration
The agent connects to the Go API via the gateway URL. Configure with env vars:
```bash
VITE_API_URL=http://your-server:80
VITE_WEB_URL=http://your-server:80
```

## API Endpoints

All REST endpoints are at `/api/*` (routed to Go):
- `POST /api/web/auth/login` — Manager login
- `POST /api/web/auth/signup` — Manager signup (or `/api/web/auth/signup-manager`)
- `GET /api/web/auth/me` — Current user
- `GET /api/web/dashboard/analytics` — Dashboard analytics
- `POST /api/agent/auth/login` — Agent login
- `POST /api/agent/clock-in` — Clock in
- `POST /api/agent/clock-out` — Clock out
- `POST /api/agent/activity` — Activity data
- `POST /api/agent/screenshots` — Screenshot upload
- *(Full list in backend-go/cmd/server/main.go)*

## Development

### Run individual services locally:
```bash
# Postgres
docker compose up -d postgres

# Go API (hot reload with air)
cd backend-go && go run ./cmd/server/

# WebSocket
cd backend-ws && npx ts-node-dev src/index.ts

# Frontend
cd frontend && npm run dev

# Gateway (nginx via Docker)
docker compose up -d gateway
```
