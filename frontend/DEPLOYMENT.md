# Frontend Repository Development & Deployment

## Local Development

```bash
# Clone repository
git clone https://github.com/your-org/teamlens-frontend.git
cd teamlens-frontend

# Install dependencies
npm install

# Create or update .env
cat > .env << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:5000
EOF

# Run dev server
npm run dev

# Open http://localhost:3000
```

## Docker Deployment

### Local Testing

```bash
# Build image
docker build -t teamlens-frontend .

# Run container
docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=http://localhost:5000 teamlens-frontend
```

### With Docker Compose

```bash
# Create .env
cat > .env << 'EOF'
NEXT_PUBLIC_API_URL=https://api.your-domain.com
NODE_ENV=production
EOF

# Start
docker compose up -d

# Logs
docker compose logs -f frontend
```

### Production Deployment

#### VPS Setup (One time)

```bash
ssh user@your-vps-ip

# Create directory
mkdir -p /opt/teamlens-frontend
cd /opt/teamlens-frontend

# Download docker-compose
wget https://raw.githubusercontent.com/your-org/teamlens-frontend/main/docker-compose.yml

# Create .env
cat > .env << 'EOF'
NEXT_PUBLIC_API_URL=https://api.your-domain.com
NODE_ENV=production
EOF
```

#### GitHub Secrets (Settings → Secrets → Actions)

```
VPS_HOST       = your.vps.ip
VPS_USER       = ubuntu
VPS_SSH_KEY    = your-private-ssh-key
```

#### Auto-deploy

```bash
git push origin main
# GitHub Actions automatically deploys!
```

## Build Commands

```bash
npm run build    # Build Next.js app
npm run dev      # Dev mode
npm run lint     # ESLint
npm start        # Start production server
```

## Environment Variables

Create `.env` for local/dev. Use `.env.production` as the deployment template:

```
NEXT_PUBLIC_API_URL=http://localhost:5000  # Backend API URL
```

## Nginx Configuration (if using reverse proxy)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## SSL/HTTPS Setup

Use Let's Encrypt with Certbot:

```bash
sudo certbot --nginx -d your-domain.com
```
