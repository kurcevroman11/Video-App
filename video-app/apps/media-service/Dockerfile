# Build context = repository root (see infra/docker-compose.prod.yml)
# NOTE: mediasoup prebuilt worker is glibc-based; alpine (musl) fails to run it
# and its local libwebrtc build breaks on musl, so use a Debian (glibc) base.
FROM node:20-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip build-essential pkg-config \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps apps
COPY libs libs
COPY nx.json tsconfig.json ./
RUN npm ci
WORKDIR /app/apps/media-service
RUN npm run build

FROM node:20-bookworm-slim
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app ./
WORKDIR /app/apps/media-service
CMD ["node", "dist/main"]