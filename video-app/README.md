# Video App — монолит из микросервисов для видеозвонков

Монорепозиторий (Nx) приложения видеозвонков с авторизацией, комнатами и
WebRTC-звонками с использованием `coturn` (TURN/STUN).

---

## 1. Цель проекта

Проверенный end-to-end WebRTC-звонок между двумя браузерами через внутренний
signaling и TURN-релей:

- регистрация / логин / refresh-токены;
- создание и вступление в комнаты по коду;
- обмен SDP/ICE (WebRTC) через WebSocket-signaling;
- прозрачный обход NAT с помощью собственного TURN-сервера (coturn) с
  временными credentials (TURN REST API, RFC draft-uberti-behave-turn-rest).

Логика сигналинга и переговоров вынесена в отдельные сервисы, поэтому
`gateway-service` выполняет только авторизацию и проксирование.

---

## 2. Архитектура

```
Browser A ──REST/JWT──────────────────────────────┐
    │                                              │
    │  RTCPeerConnection (SDP/ICE)                 │
    │        │                                     │
    │   (STUN/TURN media path)                     │
    ▼        ▼                                     │
┌────────────────────────────┐                    │
│        coturn              │                    │
│  (TURN/ST relay, UDP 3478, │                    │
│   relay 49152-65535)       │                    │
└────────────────────────────┘                    │
                                                  ▼
┌───────────┐   WS /signaling   ┌──────────────┐
│  client   │──────────────────→│ signaling-   │
│ (React)   │  (socket.io)      │ service (3002)│
└───────────┘      ▲            └──────────────┘
                   │                │ room-сигналы
      REST 3000     │                │ gRPC (проверка доступа)
┌───────────────────┴──┐         ┌──────────────┐      ┌────────────┐
│ gateway-service (3000)├─gRPC───│ room-service │      │ media-svc  │
│ auth / JWT / users    │  50051 │ rooms/invites│      │ (3003, pl) │
│ proxy / TURN-creds   │        └──────────────┘      └────────────┘
└──────────────────────┘              │                    │
           ┌───── postgres (gateway/room) ────── redis ─────┘
```

### Компоненты

| Компонент | Порт | Транспорт | Роль |
|---|---|---|---|
| `gateway-service` | 3000 | HTTP/REST | Регистрация, логин, refresh-ротация, `GET /users/me`, прокси `/rooms*` на room-service, `GET /turn-credentials` (TURN-креды) |
| `room-service` | 50051 (gRPC) | gRPC | Комнаты, участники, приглашения. Модель права/инвайтов |
| `signaling-service` | 3002 | WebSocket (socket.io `/signaling`) | Роуминг комнат, релей SDP (`offer/answer`) и `ice-candidate` |
| `media-service` | 3003 | HTTP | Заглушка (медиа/рекординг в перспективе) |
| `coturn` | 3478 (+5349 TLS) | UDP/TCP | TURN/STUN relay; хост-сеть, отдельный инстанс |
| `client` | 5173 | Vite | React-приложение (видеозвонки), Tailwind CSS |
| `postgres` / `redis` | 5432 / 6379 | — | Данные gateway/room; pub-sub signaling (опц.) |

Библиотеки (`libs/`): `contracts` (`.proto` и типы для gRPC), `common`,
`core` — общие типы и утилиты, используемые сервисами.

### Поток звонка (упрощённо)

1. Клиент логинится в `gateway-service` → получает `accessToken`.
2. Клиент создаёт/входит в комнату: `POST /rooms` → `POST /rooms/:id/join`
   (gateway проксирует в room-service, проверяет доступ).
3. Перед созданием `RTCPeerConnection` клиент запрашивает:
   `GET /turn-credentials` → получает временные `username`/`credential`
   (`credential = base64(HMAC-SHA1(sharedSecret, "<expiry>:<userId>"))`).
4. Клиент коннектится к `signaling-service` (WS) и получает `offer/answer/ice-candidate`.
5. Обмен SDP/ICE происходит по WebRTC (perfect negotiation). Если прямой путь
   невозможен (NAT), трафик идёт через coturn (relay-кандидаты).

---

## 3. Стек

- **Monorepo:** Nx + `npm` workspaces
- **Backend:** NestJS (HTTP), `@nestjs/microservices` (gRPC), Prisma ORM
- **Frontend:** React 18 + Vite 5 + TypeScript + Tailwind CSS v4
- **Межсервисный:** gRPC/Protobuf
- **WebRTC:**
  - `RTCPeerConnection` c `iceTransportPolicy` по умолчанию
  - signaling через socket.io
  - TURN/STUN: coturn (`coturn/coturn` docker-image)
- **БД:** PostgreSQL, Redis
- **Инфраструктура:** Docker Compose, Azure Dev Tunnels (для удалённого доступа)

---

## 4. Структура репозитория

```
apps/
  gateway-service/        # auth + REST-прокси + TURN-креды (NestJS)
  room-service/           # комнаты/участники/инвайты (gRPC, Prisma)
  signaling-service/      # WebSocket-signaling (socket.io)
  media-service/          # placeholder (NestJS)
  client/                 # React UI (Vite, Tailwind)
infra/
  coturn/turnserver.conf  # конфиг TURN-сервера
  docker-compose.yml        # dev-стек
  docker-compose.prod.yml   # прод-стек
  plain-docker-compose.coturn.yml # отдельный инстанс coturn (host-net)
libs/
  contracts/              # .proto + типы gRPC
  common/ core/           # общие типы/утилиты
```

---

## 5. Требования к окружению

- Node.js ≥ 18, npm ≥ 9
- Docker + Docker Compose (для postgres/redis/coturn)
- Доступ в интернет для установки пакетов и pull образов

---

## 6. Запуск в режиме разработки

### 6.1 БД и туннельные сервисы

```bash
docker compose -f infra/docker-compose.yml up -d
```

Поднимет `postgres` и `redis` (и остальные сервисы, если нужно). Для coturn:

```bash
docker compose -f infra/docker-compose.coturn.yml up -d
```

`coturn` использует `network_mode: host` и должен запускаться на отдельной VM
(релейный диапазон портов ~16000 нельзя пробрасывать через userland-proxy).

### 6.2 Схемы БД (Prisma)

Для каждого сервиса с Prisma выполнить миграцию схемы:

```bash
cd apps/gateway-service && npx prisma db push
cd apps/room-service     && npx prisma db push
```

(или `npm run db:generate` / `db:push` из корня каждого приложения).

### 6.3 Переменные окружения

Копии уже лежат в `apps/*/.env`. Ключевые:

- `gateway-service/.env`: `DATABASE_URL`, `JWT_SECRET`, `TURN_SHARED_SECRET`,
  `TURN_URL=localhost:3478`, `TURN_TLS_URL=localhost:5349`, `ROOM_SERVICE_HOST/PORT`
- `client/.env`: `VITE_API_URL`, `VITE_SIGNALING_URL`
- `signaling-service/.env`: `JWT_SECRET` (общий с gateway), `REDIS_URL`

> **Важно:** `TURN_SHARED_SECRET` в `gateway-service/.env` и
> `static-auth-secret` в `infra/coturn/turnserver.conf` должны совпадать —
> иначе coturn отклонит подключения.

### 6.4 Запуск всех сервисов

Из корневой папки:

```bash
npm install
npm run dev
```

Это запустит параллельно все `apps/*` в режиме watch. Либо по отдельности:

```bash
npm run dev:gateway   # 3000
npm run dev:room      # gRPC 50051
npm run dev:signaling # 3002
npm run dev:client    # 5173
```

Проверка:

- `http://localhost:5173` — клиент
- `http://localhost:3000/api/docs` — Swagger gateway-service

---

## 7. WebRTC и TURN

- Клиент получает ICE-серверы через `GET /turn-credentials` (Bearer-JWT)
  перед созданием `RTCPeerConnection`.
- Креды временные: `username = "<unix-expiry>:<userId>"`,
  `credential = base64(HMAC-SHA1(secret, username))`.
- coturn сам валидирует HMAC (`use-auth-secret`), не обращаясь к БД.
- Для диагностики почения можно заставить клиента ходить только через relay:
  `iceTransportPolicy: 'relay'` — тогда активная candidate-pair должна иметь
  тип `relay` (проверяется в `chrome://webrtc-internals`).

---

## 8. Деплой

### 8.1 Запуск прод-стек

```bash
docker compose -f infra/docker-compose.prod.yml up -d --build
```

Ожидает в окружении `DATABASE_URL`, `JWT_SECRET`, `TURN_SHARED_SECRET` и т.д.

### 8.2 Требование к coturn в проде

- Отдельный инстанс/VM, `network_mode: host`.
- Открыты порты: 3478/udp, 5349 (TLS), relay 49152-65535/udp.
- `denied-peer-ip` для приватных диапазонов — обязательно.
- `external-ip=<публичный>`.

Поднять только coturn:

```bash
docker compose -f infra/docker-compose.coturn.yml up -d
```

### 8.3 Публичный доступ (Dev Tunnels / локальный провайдер)

Для «+» кнопки доступа клиента с других устройств:

```bash
devtunnels create videoapp-client --port 5173 --access-token public
devtunnels create videoapp-gateway --port 3000 --access-token public
devtunnels create videoapp-signaling --port 3002 --access-token public
```

и затем указать публичные URL в `client/.env`:

```
VITE_API_URL=https://<hash>-3000.euw.devtunnels.ms
VITE_SIGNALING_URL=https://<hash>-3002.euw.devtunnels.ms
```

- Туннели должны быть со `--access-token public` (иначе другие устройства
  получат 302 на логин Dev Tunnels).
- `gateway-service` уже разрешает CORS для `*.devtunnels.ms`.

---

## 9. Тест-сценарий (что должно работать)

1. Открыть два браузера / устройства на `http://localhost:5173`
   (или публичном URL).
2. Залогиниться двумя разными аккаунтами.
3. Создать комнату на одном, войти по коду на втором.
4. Звонок устанавливается: статус `CONNECTED`, видео/аудио в обоих тайлах.

Проверка через TURN (обязательно для Stage 4):

- `chrome://webrtc-internals` → в активной `candidate-pair` тип `relay`
- При `iceTransportPolicy: 'relay'` звонок всё равно работает
- Истёкшие/подделанные TURN-credentials отклоняются coturn

---

## 10. Полезные скрипты (корень)

| Команда | Описание |
|---|---|
| `npm run dev` | запустить все сервисы параллельно |
| `npm run build` | сборка всех приложений |
| `npm run lint` / `npm run test` | линт / тесты (если настроены) |
| `docker compose ... up` | поднять БД/redis/coturn |