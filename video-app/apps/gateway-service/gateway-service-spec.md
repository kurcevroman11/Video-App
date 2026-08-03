# gateway-service — детальная спецификация

## 1. Зона ответственности (и что НЕ входит)

`gateway-service` владеет только данными аутентификации (`users`, `refresh_tokens`). Он **не имеет собственной таблицы `rooms`** и не лезет в БД room-service напрямую — единственный канал взаимодействия с комнатами — gRPC-вызовы к `room-service`. Это разделение уже заложено в архитектуре, здесь просто напоминание, чтобы агент не начал "для простоты" писать напрямую в чужую БД.

---

## 2. Модель данных (Prisma, своя БД)

```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  displayName  String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  refreshTokens RefreshToken[]
}

model RefreshToken {
  id          String   @id @default(uuid())
  userId      String
  tokenHash   String   // хеш токена, не сам токен — на случай утечки БД
  deviceInfo  String?  // user-agent / device fingerprint, для отображения "активных сессий"
  expiresAt   DateTime
  revoked     Boolean  @default(false)
  createdAt   DateTime @default(now())

  user        User     @relation(fields: [userId], references: [id])
}
```

**Почему `RefreshToken` — отдельная таблица, а не одно поле в `User`:** пользователь может быть залогинен с нескольких устройств одновременно. Одно поле позволило бы только одну активную сессию. Отдельная таблица также даёт возможность отозвать конкретную сессию (logout с одного устройства) и обнаружить кражу токена (см. п.4).

---

## 3. JWT-стратегия

| Токен | Время жизни | Где хранится на клиенте | Назначение |
|---|---|---|---|
| Access token | 15 минут | память (не localStorage — риск XSS) | авторизация запросов к API |
| Refresh token | 7–30 дней | httpOnly cookie или secure storage | получение нового access token без повторного логина |

Payload access token: `{ sub: userId, email, iat, exp }` — намеренно минимальный, никаких ролей/прав (это ответственность `room-service` на уровне конкретной комнаты, не gateway).

---

## 4. Ротация refresh-токенов (критично для безопасности)

Наивная реализация (один и тот же refresh token используется многократно до истечения) уязвима: если токен украли, вор пользуется им неограниченно долго. Правильная схема — **rotation with reuse detection**:

```
POST /auth/refresh (refreshToken):
  record = findByTokenHash(hash(refreshToken))

  if !record → 401 Unauthorized
  if record.revoked → это reuse-атака: токен уже был использован раньше
                        → отозвать ВСЕ refresh-токены этого userId (revoke all sessions)
                        → 401 Unauthorized
  if record.expiresAt < now → 401 Unauthorized

  revoke(record)  // старый токен больше не годится, даже если не истёк
  newAccessToken = generateAccess(record.userId)
  newRefreshToken = generateRefresh(record.userId)
  save(newRefreshToken)

  return { accessToken: newAccessToken, refreshToken: newRefreshToken }
```

Ключевая идея: если сервер видит попытку использовать **уже отозванный** refresh-токен — это сигнал, что токен был скомпрометирован (кто-то использовал его копию раньше законного владельца), и в ответ отзываются все сессии пользователя.

---

## 5. Хеширование паролей

- `bcrypt` (cost factor 10-12) или `argon2` (предпочтительнее для новых проектов, устойчивее к GPU-брутфорсу)
- Пароль **никогда** не логируется и не возвращается в ответах API, даже в `GET /users/me`
- При логине — намеренно одинаковое сообщение об ошибке и для "email не найден", и для "неверный пароль" (`Invalid credentials`), чтобы не давать атакующему возможность перебором узнавать существующие email

---

## 6. REST API

```
POST   /auth/register        { email, password, displayName } → { accessToken, refreshToken }
POST   /auth/login           { email, password }               → { accessToken, refreshToken }
POST   /auth/refresh         { refreshToken }                  → { accessToken, refreshToken }
POST   /auth/logout          { refreshToken }                  → 204 (отзывает конкретную сессию)
GET    /users/me             (JWT)                             → { id, email, displayName }

POST   /rooms                (JWT) { name, type }               → проксирует в room-service.CreateRoom
GET    /rooms/:id            (JWT)                              → room-service.GetRoom
DELETE /rooms/:id            (JWT)                              → room-service.DeleteRoom
POST   /rooms/:id/join       (JWT) { inviteCode? }              → room-service.JoinRoom
POST   /rooms/:id/leave      (JWT)                               → room-service.LeaveRoom
GET    /rooms/:id/members    (JWT)                               → room-service.ListParticipants
```

**Важно:** `userId` во всех прокси-запросах берётся из JWT (проверенного `JwtAuthGuard`), а не из тела запроса. Иначе любой клиент сможет создавать комнаты или входить в них от имени другого пользователя, просто подставив чужой `userId` в JSON.

---

## 7. Паттерн тонкого прокси (пример)

```typescript
@UseGuards(JwtAuthGuard)
@Controller('rooms')
export class RoomsController {
  constructor(
    @Inject('ROOM_SERVICE') private readonly roomServiceClient: ClientGrpc,
  ) {}

  private roomService: RoomServiceClient;

  onModuleInit() {
    this.roomService = this.roomServiceClient.getService<RoomServiceClient>('RoomService');
  }

  @Post()
  async createRoom(@CurrentUser() user: JwtPayload, @Body() dto: CreateRoomDto) {
    return this.roomService.createRoom({ ownerId: user.sub, ...dto });
  }

  @Post(':id/join')
  async joinRoom(
    @CurrentUser() user: JwtPayload,
    @Param('id') roomId: string,
    @Body() dto: JoinRoomDto,
  ) {
    return this.roomService.joinRoom({ roomId, userId: user.sub, inviteCode: dto.inviteCode });
  }
}
```

`gateway-service` здесь не содержит бизнес-логики про комнаты вообще — только маппинг HTTP → gRPC и извлечение `userId` из токена. Вся валидация прав уже на стороне `room-service`.

**Обработка ошибок при недоступности room-service:** если gRPC-вызов падает по таймауту/недоступности сервиса — gateway возвращает `503 Service Unavailable`, не пробрасывая клиенту сырую gRPC-ошибку с внутренними деталями.

---

## 8. Rate limiting

Через `@nestjs/throttler`:

| Эндпоинт | Лимит |
|---|---|
| Глобально | 100 запросов / минуту / IP |
| `POST /auth/login` | 5 запросов / минуту / IP |
| `POST /auth/register` | 3 запроса / минуту / IP |
| `POST /auth/refresh` | 10 запросов / минуту / IP |

Более строгие лимиты именно на auth-эндпоинты — стандартная защита от брутфорса и credential stuffing, не даём атакующему перебирать пароли с той же скоростью, что и обычные запросы к API.

---

## 9. Структура модуля

```
apps/gateway-service/src/
├── auth/
│   ├── auth.controller.ts
│   ├── auth.service.ts        # регистрация, логин, refresh, logout, ротация токенов
│   ├── strategies/
│   │   └── jwt.strategy.ts
│   ├── guards/
│   │   └── jwt-auth.guard.ts
│   ├── dto/ (register.dto.ts, login.dto.ts, refresh.dto.ts)
│   └── decorators/
│       └── current-user.decorator.ts
├── users/
│   ├── users.controller.ts
│   ├── users.service.ts
│   └── users.repository.ts
├── rooms/
│   ├── rooms.controller.ts    # тонкий прокси, без бизнес-логики
│   └── rooms.grpc-client.ts
├── common/
│   ├── filters/grpc-exception.filter.ts   # маппинг gRPC-ошибок в HTTP-статусы
│   └── throttler/throttler.config.ts
├── prisma/schema.prisma
└── main.ts
```

---

## 10. Тест-кейсы (definition of done требует покрыть все ниже)

**Регистрация**
- успешная регистрация создаёт пользователя, пароль в БД хранится хешированным, не plaintext
- регистрация с уже существующим email → `ConflictException`
- регистрация со слабым паролем (короче N символов) → `BadRequestException`

**Логин**
- успешный логин с верными данными → пара токенов
- логин с несуществующим email → `UnauthorizedException` с тем же сообщением, что и ниже
- логин с неверным паролем → `UnauthorizedException`, идентичное сообщение об ошибке (не различимо от предыдущего кейса)

**Refresh-ротация**
- валидный refresh → новая пара токенов, старый refresh становится `revoked = true`
- повторное использование уже отозванного refresh-токена → все сессии пользователя отзываются, `401`
- истёкший refresh → `401`
- refresh несуществующего токена → `401`

**Защищённые роуты**
- запрос без `Authorization` заголовка → `401`
- запрос с истёкшим access token → `401`
- запрос с валидным токеном → пропускается, `req.user` заполнен данными из payload

**Прокси к room-service**
- `POST /rooms` передаёт в `room-service.CreateRoom` именно `userId` из токена, а не из тела запроса, даже если в теле подсунут другой `userId`
- при недоступности `room-service` → `503`, без утечки деталей gRPC-ошибки в ответе клиенту

**Rate limiting**
- 6-я попытка логина за минуту с одного IP → `429 Too Many Requests`

---

## 11. Что сознательно НЕ входит в этот этап

- Роли/права внутри конкретной комнаты — это `room-service`, gateway про них не знает
- OAuth/социальные логины — можно добавить позже как отдельную стратегию `passport`, не блокирует MVP
- Восстановление пароля по email — отдельная задача, не блокирует Definition of Done этого этапа
