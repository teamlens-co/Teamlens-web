# Backend Repository Structure

```
teamlens-backend/
├── src/
├── prisma/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── .dockerignore
├── .github/
│   └── workflows/
│       ├── build.yml
│       └── deploy.yml
├── package.json
├── tsconfig.json
└── README.md
```

## Local Development

```bash
# 1. Clone and install
git clone https://github.com/your-org/teamlens-backend.git
cd teamlens-backend
npm install

# 2. Create .env
cp .env.example .env

# 3. Start with Docker
docker compose up -d

# 4. Run migrations
docker compose exec backend npx prisma migrate deploy

# 5. Backend runs on http://localhost:5000
```

## Production Deployment

### VPS Setup (One time)

```bash
ssh user@your-vps-ip

# Create deployment directory
mkdir -p /opt/teamlens-backend
cd /opt/teamlens-backend

# Copy docker-compose.yml from repo
wget https://raw.githubusercontent.com/your-org/teamlens-backend/main/docker-compose.yml

# Create .env with production secrets
cat > .env << 'EOF'
DB_USER=teamlens_prod
DB_PASSWORD=your_secure_password
DB_NAME=teamlens_prod_db
JWT_SECRET=your_jwt_secret_key_here
WEB_APP_URL=https://your-domain.com
NODE_ENV=production
EOF
```

### GitHub Secrets (Settings → Secrets → Actions)

```
VPS_HOST       = your.vps.ip
VPS_USER       = ubuntu
VPS_SSH_KEY    = your-private-ssh-key
```

### Auto-deploy

```bash
git push origin main
# GitHub Actions will automatically deploy!
```

## Docker Commands

```bash
# View logs
docker compose logs -f backend

# Stop services
docker compose down

# Rebuild
docker compose build --no-cache

# SSH into container
docker compose exec backend sh
```

## Environment Variables

See `.env.example` for all available options.

Key variables:
- `DB_HOST`: PostgreSQL hostname
- `JWT_SECRET`: Secret for JWT signing (min 32 chars)
- `WEB_APP_URL`: Frontend URL for CORS
- `NODE_ENV`: "production" or "development"
