# room-service — детальная спецификация

## 1. Роли и права доступа (permission matrix)

| Действие | owner | moderator | participant |
|---|---|---|---|
| Удалить комнату | ✅ | ❌ | ❌ |
| Кикнуть участника | ✅ | ✅ (кроме owner/moderator) | ❌ |
| Замьютить/размьютить другого | ✅ | ✅ | ❌ |
| Повысить/понизить роль | ✅ | ❌ | ❌ |
| Создать инвайт | ✅ | ✅ | ❌ |
| Посмотреть список участников | ✅ | ✅ | ✅ |
| Выйти из комнаты | ✅ * | ✅ | ✅ |

`*` — выход owner'а требует явной передачи роли другому участнику (`transferOwnership`) либо автоматически закрывает комнату, если участников больше нет. Без этого правила комната может остаться без owner'а — это баг, а не бизнес-кейс.

**Важные ограничения:**
- В комнате всегда ровно один `owner`. Это гарантируется на уровне БД (unique constraint не поставить напрямую на "один owner", поэтому проверка — на уровне сервиса + транзакция при передаче роли).
- `moderator` не может кикнуть другого `moderator` или `owner` — иначе несколько модераторов смогут выдавить друг друга.
- Кикнутый участник (`status = KICKED`) не может повторно войти в комнату без нового инвайта — иначе кик бессмысленен.

---

## 2. Модель данных (Prisma)

```prisma
enum RoomType {
  PUBLIC
  PRIVATE
}

enum RoomStatus {
  ACTIVE
  CLOSED
}

enum MemberRole {
  OWNER
  MODERATOR
  PARTICIPANT
}

enum MemberStatus {
  JOINED
  LEFT
  KICKED
}

model Room {
  id              String       @id @default(uuid())
  name            String
  type            RoomType
  status          RoomStatus   @default(ACTIVE)
  ownerId         String
  maxParticipants Int?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  members         RoomMember[]
  invites         Invite[]
}

model RoomMember {
  id        String       @id @default(uuid())
  roomId    String
  userId    String
  role      MemberRole   @default(PARTICIPANT)
  status    MemberStatus @default(JOINED)
  joinedAt  DateTime     @default(now())
  leftAt    DateTime?

  room      Room         @relation(fields: [roomId], references: [id])

  @@unique([roomId, userId]) // один пользователь — одна запись членства в комнате
}

model Invite {
  id         String    @id @default(uuid())
  roomId     String
  code       String    @unique
  createdBy  String
  expiresAt  DateTime?
  maxUses    Int?
  usesCount  Int       @default(0)

  room       Room      @relation(fields: [roomId], references: [id])
}
```

**Почему `RoomMember` хранит и `LEFT`, и `KICKED`, а не просто удаляется запись:** нужна история (кто когда был в комнате) и нужно различать "вышел сам" от "кикнули" — это разная бизнес-логика при попытке повторного входа.

**Почему `Invite` отдельная таблица, а не поле `inviteCode` в `Room`:** один room может иметь несколько активных инвайтов с разными ограничениями (например, один для гостей на 1 использование, другой — постоянный для команды).

---

## 3. Бизнес-правила входа в комнату

```
join(roomId, userId, inviteCode?):
  room = getRoom(roomId)
  if room.status == CLOSED → 409 Conflict

  existingMembership = findMembership(roomId, userId)
  if existingMembership?.status == JOINED → вернуть как есть (идемпотентность)
  if existingMembership?.status == KICKED → 403 Forbidden, если нет валидного inviteCode

  if room.type == PRIVATE:
    if !inviteCode → 403 Forbidden
    invite = validateInvite(inviteCode, roomId)  // проверка expiresAt, usesCount < maxUses
    if !invite → 403 Forbidden

  if room.maxParticipants и текущее число JOINED >= maxParticipants → 409 Conflict

  создать/обновить RoomMember: status = JOINED
  если использовался инвайт → increment usesCount
```

---

## 4. Контракт сервиса (gRPC, `libs/contracts/proto/room.proto`)

```protobuf
syntax = "proto3";

package room;

service RoomService {
  rpc CreateRoom (CreateRoomRequest) returns (Room);
  rpc GetRoom (GetRoomRequest) returns (Room);
  rpc DeleteRoom (DeleteRoomRequest) returns (Empty);

  rpc JoinRoom (JoinRoomRequest) returns (RoomMember);
  rpc LeaveRoom (LeaveRoomRequest) returns (Empty);
  rpc KickParticipant (KickParticipantRequest) returns (Empty);
  rpc ChangeRole (ChangeRoleRequest) returns (RoomMember);
  rpc TransferOwnership (TransferOwnershipRequest) returns (Empty);

  rpc ListParticipants (ListParticipantsRequest) returns (ParticipantsList);
  rpc CreateInvite (CreateInviteRequest) returns (Invite);

  // используется signaling-service перед тем как пустить клиента в WS-комнату
  rpc CheckAccess (CheckAccessRequest) returns (AccessResult);
}
```

`CheckAccess` — ключевой метод для последующих этапов: именно его будет дёргать `signaling-service` перед тем, как разрешить участнику подключиться к WebSocket-комнате. Заложи его уже на этом этапе, даже если пока никто не вызывает.

---

## 5. Структура модуля в NestJS

```
apps/room-service/src/
├── rooms/
│   ├── rooms.controller.ts       # gRPC-контроллер (CreateRoom, GetRoom, DeleteRoom)
│   ├── rooms.service.ts          # бизнес-логика комнат
│   ├── rooms.repository.ts       # доступ к Prisma
│   └── dto/
├── members/
│   ├── members.controller.ts     # JoinRoom, LeaveRoom, KickParticipant, ChangeRole
│   ├── members.service.ts        # вся permission-логика отсюда
│   ├── members.repository.ts
│   └── guards/
│       └── room-permission.guard.ts
├── invites/
│   ├── invites.controller.ts
│   ├── invites.service.ts
│   └── invites.repository.ts
├── common/
│   ├── enums/ (role.enum.ts, room-type.enum.ts, member-status.enum.ts)
│   └── exceptions/ (room-not-found, forbidden-action, invite-invalid)
├── prisma/
│   └── schema.prisma
└── main.ts
```

**Почему `members` — отдельный модуль от `rooms`:** в `rooms` — CRUD над самой комнатой (создание/удаление/метаданные), в `members` — вся логика ролей, прав и присоединения. Это разные зоны ответственности с разной частотой изменений: правила ролей будут дорабатываться чаще, чем схема комнаты.

Пример guard'а (концептуально, не полная реализация):

```typescript
@Injectable()
export class RoomPermissionGuard implements CanActivate {
  constructor(private readonly membersService: MembersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { roomId, userId, requiredRole } = extractContext(context);
    const member = await this.membersService.getMembership(roomId, userId);

    if (!member || member.status !== 'JOINED') return false;
    return hasPermission(member.role, requiredRole);
  }
}
```

---

## 6. Тест-кейсы (definition of done требует покрыть все ниже)

**Создание/удаление комнаты**
- при создании комнаты создатель автоматически получает роль `OWNER`
- удалить комнату может только `OWNER`; попытка от `MODERATOR`/`PARTICIPANT` → `ForbiddenException`
- удаление несуществующей комнаты → `NotFoundException`

**Вход в комнату**
- вход в публичную комнату без инвайта — успешен
- вход в приватную комнату без инвайта — `ForbiddenException`
- вход в приватную комнату с валидным инвайтом — успешен, `usesCount` инвайта увеличивается
- вход с просроченным инвайтом (`expiresAt` в прошлом) — `ForbiddenException`
- вход с инвайтом, исчерпавшим `maxUses` — `ForbiddenException`
- повторный вход уже присоединённого участника — идемпотентен, не создаёт дублей (за счёт `@@unique([roomId, userId])`)
- вход в комнату, достигшую `maxParticipants` — `ConflictException`
- вход кикнутого участника без нового инвайта — `ForbiddenException`

**Роли и модерация**
- `OWNER` может повысить `PARTICIPANT` до `MODERATOR`
- `MODERATOR` не может менять роли — `ForbiddenException`
- `MODERATOR` может кикнуть `PARTICIPANT`
- `MODERATOR` не может кикнуть `OWNER` или другого `MODERATOR` — `ForbiddenException`
- `PARTICIPANT` не может кикнуть никого — `ForbiddenException`
- кикнутый участник получает `status = KICKED`, а не удаляется из БД

**Выход из комнаты**
- `PARTICIPANT`/`MODERATOR` может выйти сам — `status = LEFT`
- `OWNER` не может просто выйти без `TransferOwnership` — либо ошибка, либо (в зависимости от выбранной политики) комната закрывается автоматически, если он последний участник

**Список участников**
- `ListParticipants` возвращает только тех, у кого `status = JOINED`

---

## 7. Что сознательно НЕ входит в этот этап

Чтобы агент не расползся за рамки:
- Никакой интеграции с WebSocket/signaling — только gRPC/REST API
- Никакой логики про медиапотоки
- Аутентификация (проверка, что `userId` реальный) — уже сделана в `gateway-service`; `room-service` доверяет `userId`, пришедшему из внутреннего вызова, и не валидирует JWT сам

Явно укажи это агенту в задаче — иначе он может попытаться "заодно" сделать WebSocket-часть, что смешает ответственность сервисов.
