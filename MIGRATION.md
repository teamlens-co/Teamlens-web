# TeamLens Full Stack Migration Guide (for OpenClaw bot)

This guide reproduces the current `srv1390961` TeamLens production environment on a fresh server.

## Scope
- Web + API services (Go backend, WebSocket backend, Next.js frontend, screenshot-AI, alert-service, nginx)
- Postgres database + uploads volume
- Docker-based deployment
- Optional: Android build env, GitHub Actions runners, CI/CD, Linux/Windows agent repos

## 1. Prerequisites on new server

```bash
# As root or a sudo user on the new server
apt update && apt upgrade -y
apt install -y git curl wget nano htop net-tools ufw nginx docker.io docker-compose-plugin

# Start Docker
systemctl enable docker
systemctl start docker

# Create workspace
cd /root
mkdir -p /root/teamlens
```

## 2. Clone repositories

```bash
cd /root/teamlens
git clone https://github.com/teamlens-co/Teamlens-web.git teamlens-web-server-v2
git clone https://github.com/teamlens-co/teamlens-linux-agent.git teamlens-linux-agent
git clone https://github.com/teamlens-co/teamlens-android-app.git teamlens-android-app
```

(Windows agent lives inside `Teamlens-web/agent`; Linux agent is its own repo.)

## 3. Networking / DNS

Point these A records to the new server public IP:
- `test.teamlens.co`
- `api.teamlens.co`
- `ws.teamlens.co` (if used)
- `turn.teamlens.co` (if you self-host coturn)

## 4. SSL certificates

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d test.teamlens.co -d api.teamlens.co
# Add more -d flags for any additional subdomains
```

## 5. Postgres container

The Go backend and WebSocket backend both connect to Postgres. Use the same container name expected by the env files (`teamlens-postgres-v2`).

```bash
docker network create teamlens-web-server_default 2>/dev/null || true

docker run -d --name teamlens-postgres-v2 \
  --restart unless-stopped \
  --network teamlens-web-server_default \
  -e POSTGRES_USER=teamlens \
  -e POSTGRES_PASSWORD=root \
  -e POSTGRES_DB=teamlens \
  -v teamlens_postgres_data:/var/lib/postgresql/data \
  -p 5432:5432 \
  postgres:15-alpine \
  postgres -c 'max_connections=200'
```

## 6. Apply database schema / migrations

Option A — migrate from existing server:
```bash
# On OLD server
pg_dump -h localhost -p 5433 -U teamlens -d teamlens -F c -f /tmp/teamlens_dump.dump
# Copy to new server
scp /tmp/teamlens_dump.dump root@NEW_SERVER_IP:/tmp/
# On NEW server
pg_restore -h localhost -U teamlens -d teamlens --clean --if-exists /tmp/teamlens_dump.dump
```

Option B — fresh install from Prisma:
```bash
cd /root/teamlens/teamlens-web-server-v2/backend-ws
npm install
npx prisma migrate deploy
npx prisma db seed   # if a seed script exists
```

## 7. Uploads volume

On OLD server:
```bash
tar czvf /tmp/teamlens_uploads.tar.gz -C /var/lib/docker/volumes/teamlens_uploads/_data .
scp /tmp/teamlens_uploads.tar.gz root@NEW_SERVER_IP:/tmp/
```

On NEW server:
```bash
docker volume create teamlens_uploads
tar xzvf /tmp/teamlens_uploads.tar.gz -C /var/lib/docker/volumes/teamlens_uploads/_data
```

## 8. Build & run Go backend (`teamlens-api-go`)

```bash
cd /root/teamlens/teamlens-web-server-v2/backend-go
docker build -t teamlens-api-go:latest .

docker run -d --name teamlens-api-go \
  --restart unless-stopped \
  --network teamlens-web-server_default \
  -p 5002:5000 \
  -v teamlens_uploads:/app/uploads \
  -e DATABASE_URL="postgresql://teamlens:root@teamlens-postgres-v2:5432/teamlens?sslmode=disable" \
  -e JWT_SECRET="teamlens_jwt_secret_key_2025" \
  -e JWT_ACCESS_TTL="30d" \
  -e JWT_AGENT_TTL="30d" \
  -e UPLOAD_DIR="/app/uploads" \
  -e CORS_ORIGINS="https://test.teamlens.co,https://api.teamlens.co" \
  -e WEB_APP_URL="https://test.teamlens.co" \
  -e OPENAI_API_KEY="<your-key-or-empty>" \
  -e KIMI_API_KEY="<your-key>" \
  -e KIMI_API_BASE_URL="https://api.cloudflare.com/client/v4/accounts/<account>/ai/v1" \
  teamlens-api-go:latest
```

## 9. Build & run WebSocket backend

```bash
cd /root/teamlens/teamlens-web-server-v2/backend-ws
docker build -t teamlens-web-server-v2-backend-ws:latest .

docker run -d --name teamlens-ws-test \
  --restart unless-stopped \
  --network teamlens-web-server_default \
  -p 4001:4001 \
  -e NODE_ENV="production" \
  -e PORT="4001" \
  -e DATABASE_URL="postgresql://teamlens:root@teamlens-postgres-v2:5432/teamlens?schema=public" \
  -e JWT_SECRET="teamlens_jwt_secret_key_2025" \
  -e JWT_ACCESS_TTL="12h" \
  -e JWT_AGENT_TTL="30d" \
  -e INVITE_TTL_HOURS="72" \
  -e WEB_APP_URL="https://test.teamlens.co" \
  -e CORS_ORIGINS="https://test.teamlens.co" \
  -e WEBRTC_ICE_SERVERS='[{"urls":["stun:stun.l.google.com:19302"]}]' \
  teamlens-web-server-v2-backend-ws:latest
```

## 10. Build & run Frontend v2

```bash
cd /root/teamlens/teamlens-web-server-v2/frontend
docker build -t teamlens-frontend-v2:test \
  --build-arg NEXT_PUBLIC_API_URL="https://api.teamlens.co" \
  --build-arg NEXT_PUBLIC_WS_URL="wss://api.teamlens.co" \
  --build-arg NEXT_PUBLIC_WEBRTC_ICE_SERVERS='<your-ice-json>' \
  --build-arg NEXT_PUBLIC_AGENT_DOWNLOAD_URL="/download/agent" \
  .

docker run -d --name teamlens-frontend-v2-test \
  --restart unless-stopped \
  --network teamlens-web-server_default \
  -p 3002:3000 \
  teamlens-frontend-v2:test
```

## 11. Screenshot-AI service

```bash
cd /root/teamlens/teamlens-web-server-v2/screenshot-ai
docker build -t teamlens-screenshot-ai:latest .

docker run -d --name screenshot-ai \
  --restart unless-stopped \
  --network teamlens-web-server_default \
  -p 5055:5055 \
  -e DATABASE_URL="postgresql://teamlens:root@teamlens-postgres-v2:5432/teamlens" \
  -e UPLOAD_DIR="/app/uploads" \
  -e SQLITE_PATH="/app/data/screenshot_ai.sqlite3" \
  -e REPORT_OUTPUT_DIR="/app/reports" \
  -e SUMMARY_HTTP_HOST="0.0.0.0" \
  -e SUMMARY_HTTP_PORT="5055" \
  -e KIMI_API_KEY="<your-key>" \
  -e KIMI_API_BASE_URL="https://api.cloudflare.com/client/v4/accounts/<account>/ai/v1" \
  -e KIMI_GATEWAY_ID="piyush-mishra" \
  -e KIMI_MODEL="@cf/moonshotai/kimi-k2.6" \
  -v teamlens_uploads:/app/uploads:ro \
  -v /root/teamlens/teamlens-web-server-v2/screenshot-ai/data:/app/data \
  -v /root/teamlens/teamlens-web-server-v2/screenshot-ai/reports:/app/reports \
  teamlens-screenshot-ai:latest
```

## 12. Alert service

Build and run similarly from `/root/teamlens/teamlens-web-server-v2/alert-service`. Check its Dockerfile / env requirements.

## 13. Nginx reverse proxy

Use this skeleton and adapt paths to your SSL certs:

```nginx
server {
    listen 443 ssl http2;
    server_name test.teamlens.co;
    ssl_certificate /etc/letsencrypt/live/test.teamlens.co/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/test.teamlens.co/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl http2;
    server_name api.teamlens.co;
    ssl_certificate /etc/letsencrypt/live/api.teamlens.co/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.teamlens.co/privkey.pem;

    client_max_body_size 200M;

    location / {
        proxy_pass http://127.0.0.1:5002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then reload:
```bash
nginx -t && systemctl reload nginx
```

## 14. Verify

```bash
# Health checks
curl -s https://api.teamlens.co/api/web/health  # or whatever health route exists
curl -s https://test.teamlens.co

# Check containers
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

# Check logs if anything fails
docker logs --tail 50 teamlens-api-go
```

## 15. CI/CD / GitHub Actions (optional)

On the new server:
- Add the new server's SSH key as a GitHub Actions secret.
- Update `.github/workflows/*.yml` deploy steps to point to the new server IP.
- Ensure `scripts/deploy-remote.sh` env vars match the new server.

## 16. Agent download endpoints

The Next.js frontend resolves Windows/Linux agent releases from GitHub. As long as repos `teamlens-co/Teamlens-web` and `teamlens-co/teamlens-linux-agent` are public and have releases, downloads will work.

## 17. Secrets to migrate / set fresh

- GitHub tokens / SSH deploy keys
- `JWT_SECRET` (keep same if you want existing tokens valid; rotate otherwise)
- `KIMI_API_KEY`, `KIMI_API_BASE_URL`
- TURN server credentials (coturn)
- Sentry / PostHog keys
- Tauri updater private key (Linux agent)

---

## Quick command checklist for OpenClaw bot

If you are the OpenClaw bot on the new server, run this sequence and stop on any error:

```bash
cd /root
mkdir -p teamlens && cd teamlens
git clone https://github.com/teamlens-co/Teamlens-web.git teamlens-web-server-v2
systemctl enable docker --now
docker network create teamlens-web-server_default || true
# Restore DB + uploads volume first if migrating from old server
# Then run the docker build/run commands above.
```

Stop and ask the human if:
- SSL certs fail to issue.
- Postgres restore fails.
- Any container exits immediately after start.
