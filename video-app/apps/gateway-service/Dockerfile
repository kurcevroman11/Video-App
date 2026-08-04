# Build context = repository root (see infra/docker-compose.prod.yml)
FROM node:20-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps apps
COPY libs libs
COPY nx.json tsconfig.json ./
# Install only gateway-service (+ its @video-app/* workspace deps) so mediasoup
# postinstall from media-service is not triggered; native deps (argon2, prisma)
# build/install normally on Debian.
RUN npm ci --workspace @video-app/gateway-service
WORKDIR /app/apps/gateway-service
RUN npx prisma generate && npm run build

FROM node:20-bookworm-slim
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app ./
WORKDIR /app/apps/gateway-service
CMD ["node", "dist/main"]