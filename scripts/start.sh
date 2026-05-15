#!/bin/bash
# TeamLens v2 — Quick Start
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "=========================================="
echo "  TeamLens v2 — Starting all services"
echo "=========================================="

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from .env.example..."
    cp .env.example .env
    echo "⚠️  Edit .env with your configuration before deploying."
fi

# Build and start all services
echo "🚀 Building and starting services..."
docker compose up --build -d

echo ""
echo "=========================================="
echo "  ✅ All services started!"
echo "=========================================="
echo ""
echo "  Nginx Gateway:  http://localhost"
echo "  Go API:         http://localhost:8080  (or via gateway: /api/)"
echo "  WebSocket:      http://localhost:4000  (or via gateway: /socket.io/)"
echo "  Frontend:       http://localhost:3000  (or via gateway: /)"
echo "  Postgres:       localhost:5433"
echo ""
echo "  Quick test:"
echo "    curl http://localhost/health"
echo "    curl http://localhost/api/health"
echo ""

# Show logs
docker compose logs -f
