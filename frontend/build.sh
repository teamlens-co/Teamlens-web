#!/bin/bash

# Frontend build script
# NEXT_PUBLIC_API_URL must be provided by the environment.

echo "========================================"
echo "TeamLens Frontend Build Script"
echo "========================================"
echo ""
echo "API Base URL: ${NEXT_PUBLIC_API_URL:-}"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed"
    exit 1
fi

echo "[1/4] Checking Node.js version..."
node --version
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "ERROR: npm is not installed"
    exit 1
fi

echo "[2/4] Installing dependencies..."
npm ci
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install dependencies"
    exit 1
fi
echo "Dependencies installed successfully"
echo ""

# Validate environment variables
if [ -z "$NEXT_PUBLIC_API_URL" ]; then
    echo "ERROR: NEXT_PUBLIC_API_URL is not set"
    echo "Example:"
    echo "  NEXT_PUBLIC_API_URL=http://localhost:8080 ./build.sh"
    exit 1
fi

export NODE_ENV=production
export NEXT_TELEMETRY_DISABLED=1

echo "[3/4] Building Next.js application..."
echo "Build configuration:"
echo "   - API Base URL: $NEXT_PUBLIC_API_URL"
echo "   - Environment: $NODE_ENV"
echo ""

npm run build
if [ $? -ne 0 ]; then
    echo "ERROR: Build failed"
    exit 1
fi
echo "Build completed successfully"
echo ""

echo "[4/4] Build artifacts ready"
echo "   - Output directory: ./.next"
echo "   - Public files: ./public"
echo ""

echo "========================================"
echo "Build Complete!"
echo "========================================"
echo ""
echo "To start the production server:"
echo "   npm run start"
echo ""
echo "To run with custom port:"
echo "   npm run start -- -p 3000 -H 0.0.0.0"
echo ""
