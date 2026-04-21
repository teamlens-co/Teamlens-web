# Backend Repository Dockerfile
FROM node:20-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates wget \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY src ./src
COPY tsconfig.json ./
COPY prisma ./prisma

RUN npx prisma generate \
  && npx tsc \
  && npm prune --omit=dev

# Runtime stage
FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates wget \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./

# Create uploads directory for multer screenshot storage
RUN mkdir -p /app/uploads/screenshots

RUN groupadd -g 1001 nodejs && useradd -m -u 1001 -g nodejs nodejs
RUN chown -R nodejs:nodejs /app/uploads
USER nodejs

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {if (r.statusCode !== 200) process.exit(1)}).on('error', () => process.exit(1))"

EXPOSE 5000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
