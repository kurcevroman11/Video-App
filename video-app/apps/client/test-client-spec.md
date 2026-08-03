# Тестовый клиент (Этап 3) — детальная спецификация

## 1. Зачем этот клиент вообще нужен

Это **не продуктовый UI**, а инструмент проверки, что WebRTC-хендшейк через `signaling-service` в принципе работает. Задача агента — не "красивый интерфейс звонка", а минимальный React-компонент, на котором видно: локальное видео, удалённое видео, статус соединения. Явно скажи это агенту, иначе он потратит время на CSS вместо проверки хендшейка.

---

## 2. Машина состояний соединения

Клиенту нужно явно отслеживать состояние — иначе агент напишет "получили offer → сразу звоним", без обработки ошибок и без индикации пользователю, что происходит.

```
IDLE
  │  (нажали "Войти в комнату")
  ▼
CONNECTING_SIGNALING     — устанавливаем WS-соединение с signaling-service
  │  (socket подключился, room-joined получен)
  ▼
WAITING_FOR_PEER         — в комнате пока только я
  │  (пришло user-joined — второй участник зашёл)
  ▼
NEGOTIATING              — идёт обмен offer/answer/ICE
  │  (pc.connectionState === 'connected')
  ▼
CONNECTED                — медиапотоки идут, видно видео друг друга
  │  (peer отключился / user-left / connectionState === 'failed')
  ▼
DISCONNECTED / FAILED    — показать причину, дать возможность переподключиться вручную
```

Дополнительное состояние вне основного потока:

```
PERMISSION_DENIED   — getUserMedia отклонён пользователем или устройство недоступно
```

**Почему это важно закладывать сразу, а не "по ходу дела":** без явной state machine агент типично пишет код, который работает только в happy path (два человека одновременно открыли вкладки, дали разрешение на камеру, сеть не моргнула) — а именно отклонения от happy path и являются реальными багами, которые потом сложно найти.

---

## 3. Обработка getUserMedia и типичных отказов

```typescript
async function acquireLocalMedia(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: true,
    });
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      // пользователь явно отклонил доступ к камере/микрофону
      throw new ClientError('PERMISSION_DENIED', 'Доступ к камере/микрофону отклонён');
    }
    if (err.name === 'NotFoundError') {
      // на устройстве физически нет камеры/микрофона
      throw new ClientError('NO_DEVICE', 'Камера или микрофон не найдены');
    }
    if (err.name === 'NotReadableError') {
      // устройство занято другим приложением
      throw new ClientError('DEVICE_BUSY', 'Устройство уже используется другим приложением');
    }
    throw new ClientError('UNKNOWN_MEDIA_ERROR', err.message);
  }
}
```

Каждая из этих ошибок — не гипотетическая, а то, что реально произойдёт при первом же тестировании (например, у тестировщика уже открыт Zoom и держит камеру). Без разбора по `err.name` агент покажет одну и ту же непонятную ошибку на все три случая.

---

## 4. React-компонент (структура)

```
apps/client/src/
├── components/
│   ├── VideoCallRoom.tsx       # основной компонент, держит state machine
│   ├── LocalVideo.tsx          # превью своей камеры
│   ├── RemoteVideo.tsx         # видео собеседника
│   └── ConnectionStatus.tsx    # индикатор текущего состояния (из п.2)
├── hooks/
│   ├── useSignalingSocket.ts   # подключение к signaling-service, обработка событий
│   └── usePeerConnection.ts    # инкапсулирует RTCPeerConnection + его события
└── lib/
    └── webrtc-config.ts        # iceServers, constraints
```

**Почему `RTCPeerConnection` вынесен в отдельный хук, а не живёт прямо в компоненте:** он должен переживать ре-рендеры компонента (нельзя пересоздавать peer connection на каждый рендер) и корректно закрываться при размонтировании — хук с `useRef` + `useEffect` cleanup для этого — стандартный паттерн, а не то, что стоит изобретать заново внутри JSX-компонента.

---

## 5. Пример `usePeerConnection`

```typescript
function usePeerConnection(socket: Socket, remoteUserId: string | null) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    pcRef.current = pc;

    pc.onconnectionstatechange = () => setConnectionState(pc.connectionState);

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && remoteUserId) {
        socket.emit('ice-candidate', { targetUserId: remoteUserId, candidate: event.candidate });
      }
    };

    return () => {
      pc.close(); // обязательная очистка — иначе соединение и медиапотоки утекут при размонтировании
      pcRef.current = null;
    };
  }, [remoteUserId]);

  return { pcRef, connectionState, remoteStream };
}
```

**Почему `pc.close()` в cleanup обязателен:** без него при повторном входе в комнату (например, после react hot-reload в дев-режиме или при навигации назад-вперёд) накопятся "зомби"-соединения, удерживающие камеру занятой — типичный источник трудноуловимого бага именно в связке React + WebRTC.

---

## 6. Обработка событий сигналинга внутри компонента

```typescript
useEffect(() => {
  socket.on('user-joined', async ({ userId }) => {
    setRemoteUserId(userId);
    setStatus('NEGOTIATING');

    // мы уже были в комнате → мы инициатор (правило из спеки signaling-service)
    const offer = await pcRef.current!.createOffer();
    await pcRef.current!.setLocalDescription(offer);
    socket.emit('offer', { targetUserId: userId, sdp: offer });
  });

  socket.on('offer', async ({ userId, sdp }) => {
    setRemoteUserId(userId);
    setStatus('NEGOTIATING');
    await pcRef.current!.setRemoteDescription(sdp);
    const answer = await pcRef.current!.createAnswer();
    await pcRef.current!.setLocalDescription(answer);
    socket.emit('answer', { targetUserId: userId, sdp: answer });
  });

  socket.on('answer', async ({ sdp }) => {
    await pcRef.current!.setRemoteDescription(sdp);
  });

  socket.on('ice-candidate', async ({ candidate }) => {
    await pcRef.current!.addIceCandidate(candidate);
  });

  socket.on('user-left', () => {
    setStatus('DISCONNECTED');
    setRemoteUserId(null);
    setRemoteStream(null);
  });

  return () => {
    socket.off('user-joined');
    socket.off('offer');
    socket.off('answer');
    socket.off('ice-candidate');
    socket.off('user-left');
  };
}, [socket]);
```

**Важный нюанс, который агент часто упускает:** `addIceCandidate` может быть вызван раньше, чем `setRemoteDescription` (ICE-кандидаты иногда приходят до answer/offer из-за особенностей тайминга сети). Если `pc.remoteDescription` ещё не установлен — кандидаты нужно буферизовать и применить после `setRemoteDescription`, а не просто вызывать `addIceCandidate` немедленно (иначе будет исключение `InvalidStateError`).

```typescript
const pendingCandidates: RTCIceCandidateInit[] = [];

socket.on('ice-candidate', async ({ candidate }) => {
  if (pcRef.current!.remoteDescription) {
    await pcRef.current!.addIceCandidate(candidate);
  } else {
    pendingCandidates.push(candidate); // применим после setRemoteDescription
  }
});

// после успешного setRemoteDescription (и в offer, и в answer-ветке):
for (const c of pendingCandidates) await pcRef.current!.addIceCandidate(c);
pendingCandidates.length = 0;
```

---

## 7. UI-требования (минимум, не дизайн)

- Два `<video>` элемента: локальный (замьючен по умолчанию, `muted` — иначе будет эхо от собственного микрофона) и удалённый
- Текстовый индикатор текущего состояния из машины состояний (п.2) — просто текст, не нужен красивый спиннер
- Кнопка "Войти в комнату" (поле для ввода `roomId` — вручную, никакого UI создания комнат на этом этапе, это делает `gateway-service`/`room-service`, отдельным API-вызовом до входа в WS)
- При `PERMISSION_DENIED`/`NO_DEVICE`/`DEVICE_BUSY` — понятный текст ошибки, без технического `err.name` на экране

---

## 8. Очистка при уходе со страницы

```typescript
useEffect(() => {
  return () => {
    localStream?.getTracks().forEach(track => track.stop()); // гасим камеру физически
    pcRef.current?.close();
    socket.disconnect();
  };
}, []);
```

Без `track.stop()` индикатор камеры в браузере (зелёная точка/иконка) останется гореть даже после ухода со страницы — явный сигнал пользователю, что что-то работает неправильно, и частая причина жалоб "камера не выключается".

---

## 9. Ручной тест-план (т.к. getUserMedia плохо тестируется в CI)

Definition of done для этого куска — не автотесты, а воспроизводимый ручной сценарий:

1. Открыть клиент в двух вкладках (или два разных браузера) под разными пользователями
2. Обе вкладки входят в одну комнату по `roomId`
3. Убедиться: у обеих появляется локальное превью сразу после захода
4. Убедиться: после захода второго — у первого статус переходит `WAITING_FOR_PEER → NEGOTIATING → CONNECTED`, появляется удалённое видео
5. Проверить audio: собственный звук не должен быть слышен себе же (локальное видео `muted`), а звук собеседника — должен
6. Закрыть одну вкладку — у второй статус переходит в `DISCONNECTED`, удалённое видео пропадает
7. Отклонить доступ к камере в одной из вкладок — должен показаться понятный текст ошибки, а не белый экран/необработанное исключение в консоли
8. Проверить в `chrome://webrtc-internals`, что соединение действительно P2P (candidate type `host`/`srflx`, а не `relay` — relay появится только когда добавим TURN на Этапе 4)

---

## 10. Что сознательно НЕ входит в этот кусок

- UI создания/поиска комнат — это отдельный экран, дергающий REST API `gateway-service`, не relevant для проверки WebRTC-хендшейка
- Переключение камеры/микрофона, демонстрация экрана — продуктовые фичи Этапа 7
- Красивый UI/дизайн-система — сейчас нужен работающий хендшейк, не внешний вид
