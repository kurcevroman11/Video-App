# media-service — детальная спецификация (Этап 5, mediasoup SFU)

## 1. Ключевая идея, которую нужно понять до кода

В P2P-модели (Этап 3) каждый клиент кодирует и отправляет свой поток каждому собеседнику отдельно — при 4 участниках это 3 исходящих потока с каждого устройства. CPU и bandwidth клиента растут линейно с числом участников, и на мобильных устройствах это упирается в потолок уже на 3-4 собеседниках.

В SFU-модели каждый клиент кодирует и отправляет поток **один раз** — на сервер. Сервер получает N потоков и рассылает их всем остальным **без перекодирования** (просто пересылка RTP-пакетов — отсюда "Selective Forwarding"). Нагрузка на клиента больше не растёт с числом участников, растёт только нагрузка на сервер (что и логично — сервер под это выделен).

**Definition of done на 4+ участниках проверяет именно это:** не "работает ли видео вообще", а "не деградирует ли качество и не падает ли клиент при переходе от 2 к 4+ участникам" — то, что в принципе невозможно было бы гарантировать в P2P-модели.

---

## 2. Базовые концепции mediasoup (без этого дальше текст не читается)

| Термин | Что это |
|---|---|
| **Worker** | Отдельный OS-процесс (не поток), делает всю тяжёлую RTP-работу. Рекомендация mediasoup — один Worker на ядро CPU. |
| **Router** | Живёт внутри Worker'а. Маршрутизирует медиапотоки **внутри одной комнаты**. Одна комната = один Router. |
| **Transport (WebRtcTransport)** | ICE/DTLS-соединение между конкретным клиентом и Router'ом. У каждого участника — свой транспорт (в этом проекте: один на отправку, один на приём — см. п.4). |
| **Producer** | Один медиатрек (аудио ИЛИ видео), который клиент отправляет на сервер через свой send-transport. |
| **Consumer** | Один медиатрек, который сервер отправляет конкретному клиенту через его recv-transport — по сути "подписка" на чужой Producer. |

Формула для комнаты на 4 участников: 4 Producer'а на аудио + 4 на видео = 8 Producer'ов, и у каждого клиента по 3 Consumer'а на аудио + 3 на видео (потребляет всех, кроме себя) = 6 Consumer'ов × 4 клиента = 24 Consumer'а. Это нормально — Consumer дешевле Producer'а по нагрузке (просто форвардинг, без декодирования на сервере).

---

## 3. Worker'ы и привязка комнаты к Worker'у

```typescript
@Injectable()
export class WorkerPoolService implements OnModuleInit {
  private workers: mediasoup.types.Worker[] = [];
  private nextWorkerIndex = 0;

  async onModuleInit() {
    const numWorkers = os.cpus().length; // один Worker на ядро
    for (let i = 0; i < numWorkers; i++) {
      const worker = await mediasoup.createWorker({
        rtcMinPort: 40000,
        rtcMaxPort: 49999,
      });
      worker.on('died', () => {
        // Worker падает целиком при крашах уровня OS-процесса — некритично для отдельного
        // RTP-пакета, но само падение Worker'а нужно ловить и алертить, а не молчать
        this.logger.error(`mediasoup worker died, pid ${worker.pid}`);
      });
      this.workers.push(worker);
    }
  }

  getNextWorker(): mediasoup.types.Worker {
    const worker = this.workers[this.nextWorkerIndex];
    this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
    return worker; // round-robin — комнаты равномерно распределяются по Worker'ам
  }
}
```

При создании Router'а для новой комнаты — брать Worker через `getNextWorker()`, а не всегда первый. Иначе все комнаты соберутся на одном Worker'е, а остальные ядра CPU будут простаивать.

---

## 4. Транспорты: один send + один recv на участника

На участника — **два** `WebRtcTransport`: один для исходящего потока (клиент → сервер, там живут его Producer'ы), второй для входящего (сервер → клиент, там живут его Consumer'ы). Раздельные transport'ы, а не один общий, — стандартная практика mediasoup: упрощает ICE-рестарт и логику пересоздания при сетевых проблемах для каждого направления независимо.

```typescript
async createWebRtcTransport(router: mediasoup.types.Router) {
  return router.createWebRtcTransport({
    listenIps: [{ ip: '0.0.0.0', announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP }],
    enableUdp: true,
    enableTcp: true,   // fallback, если UDP заблокирован на сети клиента
    preferUdp: true,
  });
}
```

`announcedIp` — обязателен и должен быть публичным IP сервера (тот же, что уже настраивал в конфиге coturn) — без него клиенты за NAT не смогут установить соединение с Worker'ом, даже если сам SFU физически работает.

---

## 5. Протокол между клиентом, signaling-service и media-service

Ключевое изменение по сравнению с Этапом 3: `signaling-service` больше не пересылает SDP от клиента к клиенту — он оркестрирует вызовы к `media-service` (по gRPC) и релеит результаты клиенту по WS. Клиент никогда не говорит напрямую с `media-service`.

### Новые WS-события (заменяют offer/answer/ice-candidate из Этапа 3)

| Событие (client → server) | Что происходит внутри |
|---|---|
| `get-router-capabilities` | signaling → media-service.GetRouterRtpCapabilities(roomId) → клиенту, нужно для инициализации mediasoup-client `Device` |
| `create-transport` `{ direction: 'send' \| 'recv' }` | signaling → media-service.CreateWebRtcTransport → клиенту параметры транспорта |
| `connect-transport` `{ transportId, dtlsParameters }` | signaling → media-service.ConnectTransport — завершает DTLS-хендшейк |
| `produce` `{ transportId, kind, rtpParameters }` | signaling → media-service.Produce → возвращает `producerId`, signaling рассылает остальным участникам `new-producer` |
| `consume` `{ producerId, rtpCapabilities }` | signaling → media-service.Consume → клиенту параметры для создания локального Consumer'а |
| `resume-consumer` `{ consumerId }` | signaling → media-service.ResumeConsumer — Consumer создаётся на паузе намеренно (см. п.7) |

| Событие (server → client) | Когда |
|---|---|
| `new-producer` `{ producerId, userId, kind }` | Кто-то в комнате начал publish (аудио или видео) — клиент должен вызвать `consume` |
| `producer-closed` `{ producerId }` | Автор потока отключился/выключил камеру — клиент закрывает соответствующий Consumer у себя |

---

## 6. Сценарий на 3 участника (демонстрирует, почему SFU не требует N² соединений)

```
Участник C заходит третьим в комнату, где уже A и B (оба уже publish аудио+видео)

C: get-router-capabilities ──▶ signaling ──▶ media-service
C ◀── rtpCapabilities ─────────────────────────────────────

C: create-transport(send) ──▶ ... ──▶ media-service.CreateWebRtcTransport
C: create-transport(recv) ──▶ ... ──▶ media-service.CreateWebRtcTransport
C: connect-transport(send) / connect-transport(recv)

C: produce(kind=audio) ──▶ media-service.Produce ──▶ producerId_C_audio
C: produce(kind=video) ──▶ media-service.Produce ──▶ producerId_C_video

signaling рассылает A и B: new-producer(producerId_C_audio), new-producer(producerId_C_video)
signaling уведомляет C о уже существующих: producerId_A_audio, producerId_A_video,
                                             producerId_B_audio, producerId_B_video

C: consume(producerId_A_audio) ──▶ media-service.Consume ──▶ consumerParameters
C: consume(producerId_A_video) ──▶ ...
C: consume(producerId_B_audio) ──▶ ...
C: consume(producerId_B_video) ──▶ ...
(аналогично A и B делают consume на producerId_C_*)

Итог: C отправил 2 потока (не 4, как было бы в P2P-mesh на 3 участников),
получил 4 потока — но сервер сам решил, откуда их взять, C не открывал
отдельное соединение с A и с B напрямую.
```

**Что важно закрепить у агента:** клиент **никогда** не создаёт `RTCPeerConnection` для другого участника напрямую — только один "виртуальный собеседник", которым для него является SFU. Вся многосторонность спрятана на сервере. Если в коде клиента появляется мэппинг `peerConnections: Map<remoteUserId, RTCPeerConnection>` — это регресс к P2P-архитектуре Этапа 3, ошибка, а не оптимизация.

---

## 7. Почему Consumer создаётся на паузе (`paused: true` по умолчанию)

```typescript
const consumer = await transport.consume({
  producerId,
  rtpCapabilities,
  paused: true, // обязательно
});
```

Если создать Consumer сразу активным, до того как клиент реально готов рендерить видео (DOM-элемент существует, обработчики повешены) — можно потерять первые кадры или получить рассинхрон. Стандартная практика: сервер создаёт Consumer на паузе → клиент получает параметры → настраивает локальный `MediaStreamTrack` → шлёт `resume-consumer` → сервер вызывает `consumer.resume()`. Это не защитная избыточность "на всякий случай", а рекомендация из официальной документации mediasoup именно из-за таймингов инициализации на клиенте.

---

## 8. Обработка отключения участника (ключевая часть Definition of Done)

Definition of done прямо требует: "при отключении одного участника остальные не разрывают соединение". Это не происходит само по себе — нужно явно каскадно закрыть его Producer'ы и уведомить остальных:

```typescript
async handleParticipantDisconnect(roomId: string, userId: string) {
  const participant = this.getParticipant(roomId, userId);

  for (const producer of participant.producers) {
    producer.close(); // закрывает и все Consumer'ы, подписанные на этот producer, на стороне mediasoup
    this.notifyRoom(roomId, 'producer-closed', { producerId: producer.id });
  }

  participant.sendTransport?.close();
  participant.recvTransport?.close();

  this.removeParticipant(roomId, userId);
}
```

**Важно:** закрытие `Producer` в mediasoup автоматически закрывает связанные с ним `Consumer`-объекты на сервере, но клиентам всё равно нужно явное `producer-closed` событие, чтобы они убрали видео-тег из UI — иначе на экране останется "замороженный" последний кадр отключившегося участника.

---

## 9. gRPC-контракт (`libs/contracts/proto/media.proto`)

```protobuf
service MediaService {
  rpc GetRouterRtpCapabilities (RoomIdRequest) returns (RtpCapabilities);
  rpc CreateWebRtcTransport (CreateTransportRequest) returns (TransportInfo);
  rpc ConnectTransport (ConnectTransportRequest) returns (Empty);
  rpc Produce (ProduceRequest) returns (ProducerInfo);
  rpc Consume (ConsumeRequest) returns (ConsumerInfo);
  rpc ResumeConsumer (ResumeConsumerRequest) returns (Empty);
  rpc CloseParticipant (CloseParticipantRequest) returns (ClosedProducersList); // для disconnect-флоу из п.8
}
```

`CloseParticipant` возвращает список закрытых `producerId` — именно их `signaling-service` разошлёт остальным как `producer-closed`, а не пытается сам разбираться, что было у участника.

---

## 10. Структура модуля

```
apps/media-service/src/
├── workers/
│   └── worker-pool.service.ts       # пул Worker'ов, round-robin
├── rooms/
│   └── router-registry.service.ts   # roomId → Router, создание/переиспользование
├── participants/
│   └── participant-state.service.ts # userId → { sendTransport, recvTransport, producers[], consumers[] }
├── transports/
│   └── transport.service.ts
├── producers/
│   └── producer.service.ts
├── consumers/
│   └── consumer.service.ts
├── grpc/
│   └── media.controller.ts          # реализация MediaService из proto
└── main.ts
```

---

## 11. Что меняется в signaling-service на этом этапе

- Убираются обработчики `offer`/`answer`/`ice-candidate` из Этапа 3 (или помечаются deprecated, если хочется сохранить путь отката)
- Добавляются обработчики из таблицы п.5, каждый — тонкий: принять WS-событие → вызвать gRPC у `media-service` → отдать результат клиенту (сам `signaling-service` по-прежнему не разбирается в SDP/RTP — только маршрутизирует)
- При `user-joined`/`user-left` из Этапа 3 логика меняется: вместо "existing initiates offer" теперь новый участник сам инициирует `get-router-capabilities` → `create-transport` → ... по сценарию из п.6

---

## 12. Тест-кейсы (definition of done требует покрыть все ниже)

**Базовый produce/consume**
- участник, зашедший первым в пустую комнату, не получает `new-producer` от других (их пока нет)
- второй участник получает уведомления о producer'ах первого и наоборот
- `consume` с `producerId`, не существующим в этой комнате — ошибка, а не тихий no-op

**Масштаб 4+ участников (главный критерий Definition of Done)**
- 4 клиента в одной комнате: у каждого в интерфейсе видно и слышно всех остальных троих
- у каждого клиента ровно 2 Producer'а (audio+video) и 6 Consumer'ов (3 собеседника × 2 трека)
- качество/задержка не деградирует заметно по сравнению с 2 участниками (нет явных признаков перегрузки Worker'а)

**Отключение**
- при отключении одного из 4 участников остальные трое сохраняют соединение друг с другом (не разрывается ничего, кроме потоков отключившегося)
- остальные получают `producer-closed` на оба трека отключившегося и убирают его видео из UI
- переподключение того же участника создаёт новые Producer'ы (не пытается переиспользовать старые закрытые)

**Worker'ы**
- при создании нескольких комнат подряд они распределяются по разным Worker'ам (round-robin), а не собираются на одном

---

## 13. Что сознательно НЕ входит в этот этап

- Simulcast (несколько версий видео в разном качестве от одного клиента) — оптимизация bandwidth, не блокирует Definition of Done, можно добавить позже без изменения базового протокола
- TCP relay как основной путь — включён как fallback в `createWebRtcTransport`, но не тестируется отдельно на этом этапе
- Автоскейлинг/несколько инстансов `media-service` — это Этап 6 и далее, здесь предполагается один инстанс с несколькими Worker'ами
- Запись комнаты — Этап 7
