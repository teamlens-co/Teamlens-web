#!/usr/bin/env bash
set -e

echo "🚀 TeamLens Development Environment Starter"
echo "============================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${RED}❌ $1 is not installed${NC}"
        return 1
    fi
    echo -e "${GREEN}✅ $1${NC}"
    return 0
}

echo ""
echo "Checking prerequisites..."
check_command docker || exit 1
check_command docker-compose || exit 1

# Check if .env file exists, create from template if not
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo -e "${YELLOW}⚠️  .env not found, copying from .env.example${NC}"
        cp .env.example .env
        echo -e "${YELLOW}⚠️  Please review .env and fill in any required values${NC}"
    fi
fi

# Create uploads directory
mkdir -p uploads

# Stop any existing dev containers
echo ""
echo "Stopping existing dev containers..."
docker-compose -f docker-compose.dev.yml down 2>/dev/null || true

# Start services
echo ""
echo "Starting development services..."
docker-compose -f docker-compose.dev.yml up -d --build

# Wait for database
echo ""
echo "Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
    if docker-compose -f docker-compose.dev.yml exec -T postgres pg_isready -U teamlens -d teamlens_dev > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PostgreSQL is ready${NC}"
        break
    fi
    echo -n "."
    sleep 1
done

# Seed test data (optional)
if [ "$1" == "--seed" ] || [ "$1" == "-s" ]; then
    echo ""
    echo "Seeding test data..."
    docker-compose -f docker-compose.dev.yml exec -T postgres psql -U teamlens -d teamlens_dev -f /docker-entrypoint-initdb.d/02-seed-data.sql 2>/dev/null || echo -e "${YELLOW}⚠️  Seed file not found, skipping${NC}"
fi

# Status
echo ""
echo -e "${GREEN}🎉 Development environment is ready!${NC}"
echo ""
echo "Services:"
echo "  Frontend:    http://localhost:3000"
echo "  Backend API: http://localhost:5000"
echo "  WS Service:  http://localhost:4001"
echo "  PostgreSQL:  localhost:5432 (teamlens_dev)"
echo "  Screenshot AI: http://localhost:8000"
echo "  Alert Service: http://localhost:8082"
echo ""
echo "Useful commands:"
echo "  View logs:          docker-compose -f docker-compose.dev.yml logs -f"
echo "  Stop:               docker-compose -f docker-compose.dev.yml down"
echo "  Restart:            docker-compose -f docker-compose.dev.yml restart"
echo "  DB shell:           docker-compose -f docker-compose.dev.yml exec postgres psql -U teamlens -d teamlens_dev"
echo ""
