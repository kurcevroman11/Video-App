FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY ../../libs/contracts ../../libs/contracts
COPY ../../libs/common ../../libs/common
COPY ../../libs/core ../../libs/core
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/main"]
