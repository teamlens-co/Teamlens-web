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
docker rm -f backend-go teamlens-api-go-test 2>/dev/null || true
docker run -d --name backend-go --restart unless-stopped \
  --network teamlens-web-server_default \
  -p 8081:5000 \
  -v teamlens_uploads:/app/uploads \
  -e DATABASE_URL="postgresql://teamlens:root@teamlens-web-server-postgres-1:5432/teamlens?sslmode=disable" \
  -e JWT_SECRET="${JWT_SECRET:-teamlens_jwt_secret_key_2025}" \
  -e JWT_ACCESS_TTL="30d" \
  -e JWT_AGENT_TTL="30d" \
  -e UPLOAD_DIR="/app/uploads" \
  -e CORS_ORIGINS="https://test.teamlens.co,https://api.teamlens.co" \
  -e WEB_APP_URL="https://test.teamlens.co" \
  teamlens-api-go:latest

echo "=== Rebuilding WebSocket ==="
cd ../backend-ws
docker build -t teamlens-ws:latest .
docker rm -f teamlens-ws-test 2>/dev/null || true
docker run -d --name teamlens-ws-test --restart unless-stopped \
  --network teamlens-web-server_default \
  -p 4001:4001 \
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
docker rm -f teamlens-frontend-v2-test 2>/dev/null || true
docker run -d --name teamlens-frontend-v2-test --restart unless-stopped \
  --network teamlens-web-server_default \
  -p 3002:3000 \
  -e SCREENSHOT_AI_URL='http://screenshot-ai:5055' \
  teamlens-frontend-v2:test

echo "=== Nginx reload ==="
# Try multiple methods to reload nginx
if command -v systemctl &>/dev/null && systemctl is-active nginx &>/dev/null; then
  systemctl reload nginx || systemctl restart nginx
elif [ -f /var/run/nginx.pid ]; then
  nginx -s reload
elif [ -f /run/nginx.pid ]; then
  nginx -s reload
else
  nginx -t && { nginx -s reload 2>/dev/null || nginx -c /etc/nginx/nginx.conf; }
fi
echo "=== Deployment complete ==="
