# signaling-service — детальная спецификация (Этап 3, P2P без SFU)

## 1. Зона ответственности на этом этапе

`signaling-service` на этом этапе — **чистый релей**: он не понимает, что такое SDP или ICE, он просто пересылает сообщения от одного участника комнаты к другому и держит минимальное состояние "кто сейчас в какой комнате". Вся логика прав — в `room-service`, вся логика WebRTC — на клиенте.

Намеренное ограничение этого этапа: **рассчитан ровно на 2 участников в комнате**. Механизм P2P-меша (каждый с каждым) для 3+ участников не масштабируется и не должен реализовываться — это тупиковая ветка, которую всё равно заменит SFU на следующем этапе. Не давай агенту "улучшать" P2P до множества участников — это потраченное впустую время.

---

## 2. Аутентификация WebSocket-соединения

В отличие от REST, где `JwtAuthGuard` проверяет токен на каждый запрос, WebSocket-соединение — одно долгоживущее, поэтому токен проверяется **один раз при хендшейке**.

```typescript
// клиент подключается так:
const socket = io('wss://signaling.example.com', {
  auth: { token: accessToken }, // тот же JWT, что выдал gateway-service
});
```

```typescript
@WebSocketGateway({ namespace: 'signaling', cors: { origin: '*' } })
export class SignalingGateway implements OnGatewayConnection {
  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    try {
      const payload = this.jwtService.verify(token); // тот же JWT_SECRET, что в gateway-service
      client.data.userId = payload.sub;
    } catch {
      client.disconnect(true); // невалидный/просроченный токен — рвём соединение сразу
    }
  }
}
```

**Важно:** `signaling-service` должен уметь верифицировать тот же JWT, что выдаёт `gateway-service` — им нужен общий `JWT_SECRET` (или пара ключей, если используется RS256). Это единственная точка связности между сервисами по секретам — задокументируй её явно в `.env.example`, чтобы агент не забыл прокинуть переменную.

---

## 3. События WebSocket

| Событие (client → server) | Payload | Назначение |
|---|---|---|
| `join-room` | `{ roomId }` | Войти в комнату (после проверки прав через room-service) |
| `offer` | `{ targetUserId, sdp }` | Переслать SDP offer конкретному участнику |
| `answer` | `{ targetUserId, sdp }` | Переслать SDP answer |
| `ice-candidate` | `{ targetUserId, candidate }` | Переслать ICE-кандидата |
| `leave-room` | `{}` | Явный выход |

| Событие (server → client) | Payload | Назначение |
|---|---|---|
| `room-joined` | `{ participants: [{ userId }] }` | Подтверждение входа + список уже присутствующих |
| `user-joined` | `{ userId }` | Новый участник зашёл в комнату |
| `user-left` | `{ userId }` | Участник вышел/отключился |
| `offer` / `answer` / `ice-candidate` | (переслано как есть) | Ретрансляция от другого участника |
| `error` | `{ code, message }` | Отказ в доступе, невалидные данные и т.д. |

**Почему события адресные (`targetUserId`), а не broadcast всем в комнате:** даже с двумя участниками это правильная модель на будущее — при переходе к SFU или при поддержке нескольких пар в одной комнате адресность уже заложена, не придётся менять протокол.

---

## 4. Сценарий хендшейка (сценарий "второй заходит — первый инициирует offer")

```
Участник A                signaling-service              Участник B
    │                            │                            │
    │──── join-room(roomId) ────▶│                            │
    │                            │─ CheckAccess(A, roomId) ──▶ room-service
    │                            │◀────── allowed ─────────────│
    │◀── room-joined([]) ────────│                            │
    │   (A первый, комната пуста)│                            │
    │                            │                            │
    │                            │◀──── join-room(roomId) ─────│
    │                            │─ CheckAccess(B, roomId) ───▶ room-service
    │                            │◀────── allowed ─────────────│
    │                            │──── room-joined([A]) ──────▶│
    │◀── user-joined(B) ─────────│                            │
    │                            │                            │
    │  (A видит, что кто-то зашёл, и по правилу               │
    │   "существующий участник инициирует offer" создаёт offer)│
    │                            │                            │
    │──── offer(target=B) ──────▶│──── offer(from=A) ─────────▶│
    │                            │                            │
    │                            │◀─── answer(target=A) ───────│
    │◀─── answer(from=B) ────────│                            │
    │                            │                            │
    │──ice-candidate(target=B)──▶│──ice-candidate(from=A)─────▶│
    │◀─ice-candidate(target=A)───│◀─ice-candidate(from=B)──────│
    │                            │                            │
    │◀════════ дальше — прямое P2P медиасоединение ══════════▶│
```

**Почему именно "существующий инициирует offer", а не наоборот:** если оба участника попробуют одновременно создать offer при обоюдном `user-joined`, возникает classic WebRTC glare (коллизия offer/offer). Фиксированное правило ("кто уже был в комнате — тот инициатор") убирает эту гонку без дополнительной glare-резолюции — это оправданное упрощение именно для 2 участников; при переходе к SFU роль "инициатора" вообще исчезнет (каждый клиент говорит только с SFU, не друг с другом).

---

## 5. Хранение состояния комнаты

На этом этапе — **только in-memory**, никакого Redis:

```typescript
@Injectable()
export class SignalingStateService {
  private rooms = new Map<string, Map<string, string>>(); // roomId → (userId → socketId)
}
```

Это осознанное упрощение: Redis появится на Этапе 6, когда понадобится несколько инстансов `signaling-service`. Вводить его раньше — преждевременная сложность, которая ничего не даёт при одном инстансе. Явно скажи агенту не тянуть Redis на этом этапе.

---

## 6. Проверка прав через room-service

```typescript
@SubscribeMessage('join-room')
async handleJoinRoom(client: Socket, payload: { roomId: string }) {
  const userId = client.data.userId;
  const access = await this.roomServiceClient.checkAccess({ roomId: payload.roomId, userId });

  if (!access.allowed) {
    client.emit('error', { code: 'ACCESS_DENIED', message: 'Not allowed in this room' });
    client.disconnect(true);
    return;
  }

  client.join(payload.roomId); // socket.io room
  this.stateService.addParticipant(payload.roomId, userId, client.id);

  const existing = this.stateService.getParticipants(payload.roomId, exclude: userId);
  client.emit('room-joined', { participants: existing });
  client.to(payload.roomId).emit('user-joined', { userId });
}
```

**Важная проверка безопасности при релее offer/answer/ice-candidate:** сервер обязан убедиться, что `targetUserId` реально находится в той же комнате (`roomId`), что и отправитель, прежде чем пересылать сообщение — иначе один клиент сможет отправлять произвольные WebRTC-данные любому подключённому сокету по угаданному `userId`, в обход комнаты.

---

## 7. Тестовый клиент-прототип (минимальный сценарий)

```javascript
const pc = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
});

const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

pc.onicecandidate = (event) => {
  if (event.candidate) {
    socket.emit('ice-candidate', { targetUserId: remoteUserId, candidate: event.candidate });
  }
};

pc.ontrack = (event) => {
  remoteVideoEl.srcObject = event.streams[0];
};

// инициатор:
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);
socket.emit('offer', { targetUserId: remoteUserId, sdp: offer });

// принимающая сторона:
socket.on('offer', async ({ userId, sdp }) => {
  await pc.setRemoteDescription(sdp);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('answer', { targetUserId: userId, sdp: answer });
});
```

Этого достаточно для проверки Definition of Done — полноценный UI не нужен, важна только работоспособность хендшейка.

---

## 8. Структура модуля

```
apps/signaling-service/src/
├── signaling/
│   ├── signaling.gateway.ts        # WS-события, вся точка входа
│   ├── signaling-state.service.ts  # in-memory состояние комнат
│   └── dto/ (join-room.dto.ts, offer.dto.ts, ice-candidate.dto.ts)
├── auth/
│   └── ws-auth.guard.ts            # верификация JWT на handshake
├── room-client/
│   └── room-service.client.ts      # gRPC-клиент к room-service (CheckAccess)
├── client-prototype/               # минимальный тестовый HTML/React-клиент
│   └── index.html
└── main.ts
```

---

## 9. Тест-кейсы (definition of done требует покрыть все ниже)

**Аутентификация**
- подключение без токена → соединение разрывается
- подключение с просроченным/невалидным токеном → соединение разрывается
- подключение с валидным токеном → `client.data.userId` установлен

**Вход в комнату**
- `join-room` в комнату, куда доступ разрешён room-service → приходит `room-joined` с текущими участниками
- `join-room` в комнату, куда доступ запрещён (например, приватная без инвайта) → `error` + disconnect
- второй участник, зашедший в комнату, получает `user-joined` на стороне первого

**Релей сигналинга**
- `offer`/`answer`/`ice-candidate`, адресованные участнику **той же** комнаты — доставляются
- `offer`/`answer`/`ice-candidate`, адресованные `userId`, который не в этой комнате — отклоняются, не доставляются (проверка безопасности из п.6)

**Отключение**
- при disconnect участника остальные в комнате получают `user-left`
- state комнаты корректно очищается (`SignalingStateService` больше не содержит отключившегося)

**End-to-end (главный критерий Definition of Done)**
- два реальных браузера (или две вкладки) успешно устанавливают видеозвонок через `stun:stun.l.google.com:19302`, видео и аудио идут в обе стороны

---

## 10. Что сознательно НЕ входит в этот этап

- Redis / multi-instance — Этап 6
- SFU / mediasoup — Этап 5
- Переподключение при разрыве сети (reconnect с восстановлением сессии) — известное ограничение, не блокирует Definition of Done
- Поддержка 3+ участников в одной комнате — тупиковая ветка для P2P, сознательно не реализуется
