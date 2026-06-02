#!/bin/bash
# Remote deploy script — executed on the VPS by deploy.yml
# Args: API_URL WS_URL ICE_SERVERS AGENT_DOWNLOAD_URL
set -e

API_ARG=$1
WS_ARG=$2
ICE_ARG=$3
AGENT_DOWNLOAD_ARG=$4

cd /root/teamlens/teamlens-web-server-v2
echo "=== Pulling latest code ==="
git pull origin main

echo "=== Rebuilding Go backend ==="
cd backend-go
docker build -t teamlens-api-go:latest .
docker rm -f teamlens-api-go-test 2>/dev/null
docker run -d --name teamlens-api-go-test --restart unless-stopped \
  --network teamlens-web-server_default \
  -p 5002:5000 \
  -v /root/teamlens/teamlens-web-server/uploads:/app/uploads \
  --env-file .env \
  teamlens-api-go:latest

echo "=== Rebuilding WebSocket ==="
cd ../backend-ws
docker build -t teamlens-ws:latest .
docker rm -f teamlens-ws-test 2>/dev/null
docker run -d --name teamlens-ws-test --restart unless-stopped \
  --network teamlens-web-server_default \
  -p 4001:4000 \
  --env-file .env \
  teamlens-ws:latest

echo "=== Rebuilding Frontend ==="
cd ../frontend
docker build -t teamlens-frontend-v2:test \
  --build-arg NEXT_PUBLIC_API_URL="$API_ARG" \
  --build-arg NEXT_PUBLIC_WS_URL="$WS_ARG" \
  --build-arg NEXT_PUBLIC_WEBRTC_ICE_SERVERS="$ICE_ARG" \
  --build-arg NEXT_PUBLIC_AGENT_DOWNLOAD_URL="$AGENT_DOWNLOAD_ARG" \
  .
docker rm -f teamlens-frontend-v2-test 2>/dev/null
docker run -d --name teamlens-frontend-v2-test --restart unless-stopped \
  --network teamlens-web-server_default \
  -p 3002:3000 \
  teamlens-frontend-v2:test

echo "=== Nginx reload ==="
nginx -s reload
echo "=== Deployment complete ==="
