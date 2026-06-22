#!/bin/bash
# UAT Deploy Script — executed by Emily (Pranav's bot) via SSH
# Fully isolated stack: separate containers, separate database
# Deploys `uat` branch to test-v2.teamlens.co
set -e

cd /root/teamlens/teamlens-web-server-v2

echo "=== Pulling latest code from uat branch ==="
git checkout uat
git pull origin uat

# ─── Backend ───
echo "=== Rebuilding UAT Backend ==="
cd backend-go
docker build -t teamlens-api-uat:latest .
docker rm -f teamlens-api-uat 2>/dev/null || true
docker run -d --name teamlens-api-uat --restart unless-stopped \
  --network teamlens-web-server_default \
  -p 5003:5000 \
  -v teamlens_uploads:/app/uploads \
  -e DATABASE_URL="postgresql://teamlens:root@teamlens-postgres-v2:5432/teamlens_uat?sslmode=disable" \
  -e JWT_SECRET="${JWT_SECRET:-teamlens_jwt_secret_key_2025}" \
  -e JWT_ACCESS_TTL="30d" \
  -e JWT_AGENT_TTL="30d" \
  -e UPLOAD_DIR="/app/uploads" \
  -e CORS_ORIGINS="https://test-v2.teamlens.co,https://test.teamlens.co" \
  -e WEB_APP_URL="https://test-v2.teamlens.co" \
  teamlens-api-uat:latest

# ─── WebSocket ───
echo "=== Rebuilding UAT WebSocket ==="
cd ../backend-ws
docker build -t teamlens-ws-uat:latest .
docker rm -f teamlens-ws-uat 2>/dev/null || true
docker run -d --name teamlens-ws-uat --restart unless-stopped \
  --network teamlens-web-server_default \
  -p 4002:4001 \
  -e NODE_ENV="production" \
  -e PORT="4001" \
  -e DATABASE_URL="postgresql://teamlens:root@teamlens-postgres-v2:5432/teamlens_uat?schema=public" \
  -e JWT_SECRET="${JWT_SECRET:-teamlens_jwt_secret_key_2025}" \
  -e JWT_ACCESS_TTL="12h" \
  -e JWT_AGENT_TTL="30d" \
  -e INVITE_TTL_HOURS="72" \
  -e WEB_APP_URL="https://test-v2.teamlens.co" \
  -e WEBRTC_ICE_SERVERS='[{"urls":["stun:stun.l.google.com:19302"]},{"urls":["turn:91.108.105.211:3478?transport=udp","turn:91.108.105.211:3478?transport=tcp"],"username":"teamlens","credential":"cL6dbZdarVNTPT3uSdmoSkWP","credentialType":"password"}]' \
  teamlens-ws-uat:latest

# ─── Frontend ───
echo "=== Rebuilding UAT Frontend ==="
cd ../frontend
docker build -t teamlens-frontend-uat:latest \
  --build-arg NEXT_PUBLIC_API_URL="" \
  --build-arg NEXT_PUBLIC_WS_URL="" \
  --build-arg NEXT_PUBLIC_WEBRTC_ICE_SERVERS='[{"urls":["stun:stun.l.google.com:19302"]},{"urls":["turn:91.108.105.211:3478?transport=udp","turn:91.108.105.211:3478?transport=tcp"],"username":"teamlens","credential":"cL6dbZdarVNTPT3uSdmoSkWP","credentialType":"password"}]' \
  --build-arg NEXT_PUBLIC_AGENT_DOWNLOAD_URL="https://github.com/teamlens-co/Teamlens-web/releases/latest/download/teamlens-agent-latest.json" \
  .
docker rm -f teamlens-frontend-uat 2>/dev/null || true
docker run -d --name teamlens-frontend-uat --restart unless-stopped \
  --network teamlens-web-server_default \
  -p 3003:3000 \
  -e SCREENSHOT_AI_URL='http://screenshot-ai:5055' \
  teamlens-frontend-uat:latest

echo "=== UAT Deployment complete! ==="
echo "URL: https://test-v2.teamlens.co"
echo ""
echo "⚠️  Nginx reload NOT done automatically."
echo "   Run: kill -HUP \$(cat /var/run/nginx.pid)"
