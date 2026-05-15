#!/bin/bash

# TeamLens Frontend Build & Deploy Script for Linux/macOS
# Builds and deploys frontend. NEXT_PUBLIC_API_URL must be provided by the environment.

set -e

ACTION="${1:-build}"
ENVIRONMENT="${2:-production}"
API_URL="${NEXT_PUBLIC_API_URL:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

function write_header() {
    echo ""
    echo -e "${CYAN}========================================"
    echo -e "$1${CYAN}"
    echo -e "========================================${NC}"
    echo ""
}

function write_step() {
    local message=$1
    local number=$2
    local total=$3
    echo -e "${YELLOW}[$number/$total] $message${NC}"
}

function verify_prerequisites() {
    write_step "Verifying prerequisites" 1 3
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}  ✗ Node.js not found${NC}"
        exit 1
    fi
    local node_version=$(node --version)
    echo -e "${GREEN}  ✓ $node_version${NC}"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}  ✗ npm not found${NC}"
        exit 1
    fi
    local npm_version=$(npm --version)
    echo -e "${GREEN}  ✓ npm $npm_version${NC}"
}

function build_frontend() {
    write_step "Building Next.js application" 2 3

    if [ -z "$API_URL" ]; then
        echo -e "${RED}  NEXT_PUBLIC_API_URL is required${NC}"
        echo -e "${YELLOW}  Example: NEXT_PUBLIC_API_URL=http://localhost:8080 ./deploy.sh build${NC}"
        exit 1
    fi
    
    echo -e "  ${CYAN}Environment configuration:${NC}"
    echo -e "    Backend API: $API_URL"
    echo ""
    
    echo -e "  ${CYAN}Installing dependencies...${NC}"
    npm ci
    echo -e "  ${GREEN}✓ Dependencies installed${NC}"
    echo ""
    
    export NEXT_PUBLIC_API_URL="$API_URL"
    export NODE_ENV=$ENVIRONMENT
    export NEXT_TELEMETRY_DISABLED=1
    
    echo -e "  ${CYAN}Building application...${NC}"
    npm run build
    echo -e "  ${GREEN}✓ Build completed successfully${NC}"
}

function deploy_docker() {
    write_step "Deploying with Docker Compose" 3 3

    if [ -z "$API_URL" ]; then
        echo -e "${RED}  NEXT_PUBLIC_API_URL is required${NC}"
        echo -e "${YELLOW}  Example: NEXT_PUBLIC_API_URL=http://localhost:8080 ./deploy.sh docker${NC}"
        exit 1
    fi
    
    echo -e "  ${CYAN}Environment configuration:${NC}"
    echo "    NEXT_PUBLIC_API_URL=$API_URL"
    echo "    NODE_ENV=$ENVIRONMENT"
    echo "    FRONTEND_PORT=3000"
    echo ""
    
    echo -e "  ${CYAN}Starting Docker Compose...${NC}"
    
    docker-compose up -d
    
    echo -e "  ${GREEN}✓ Docker deployment successful${NC}"
    echo ""
    
    echo -e "  ${CYAN}Container status:${NC}"
    docker-compose ps
}

function show_summary() {
    write_header "Deployment Complete!"
    echo -e "${GREEN}Backend API endpoint: $API_URL${NC}"
    echo ""
    echo -e "${YELLOW}Useful commands:${NC}"
    echo -e "  Start production server:   npm run start"
    echo -e "  View logs:                 docker-compose logs -f"
    echo -e "  Stop containers:           docker-compose down"
    echo ""
}

# Main execution
write_header "TeamLens Frontend Build & Deploy"

case "$ACTION" in
    build)
        verify_prerequisites
        build_frontend
        write_header "Build Complete"
        echo "Next step: Deploy with './deploy.sh deploy' or start locally with 'npm run start'"
        ;;
    deploy)
        verify_prerequisites
        build_frontend
        deploy_docker
        show_summary
        ;;
    docker)
        deploy_docker
        show_summary
        ;;
    *)
        echo -e "${RED}Unknown action: $ACTION${NC}"
        echo ""
        echo -e "${YELLOW}Usage: ./deploy.sh [Action] [Environment]${NC}"
        echo ""
        echo -e "${YELLOW}Actions:${NC}"
        echo "  build   - Build Next.js application (default)"
        echo "  deploy  - Build and deploy with Docker Compose"
        echo "  docker  - Deploy existing build with Docker Compose"
        echo ""
        echo -e "${YELLOW}Environment:${NC}"
        echo "  production - Production environment (default)"
        echo "  development- Development environment"
        exit 1
        ;;
esac
