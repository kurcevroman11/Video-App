# Build context = repository root (see infra/docker-compose.prod.yml)
FROM node:20-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps apps
COPY libs libs
COPY nx.json tsconfig.json ./
# Install only client workspace deps; skip media-service/mediasoup.
RUN npm ci --workspace @video-app/client
WORKDIR /app/apps/client
RUN npm run build

FROM nginx:alpine
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/client/dist /usr/share/nginx/html
EXPOSE 80 443