# coturn — детальная спецификация (Этап 4)

## 1. Зачем это отдельная инфраструктурная единица, а не сервис в NestJS

coturn — это не бизнес-логика, а низкоуровневый сетевой релей (реализация протоколов STUN/TURN, RFC 5766/8656). Он не пишется на NestJS и не участвует в остальной архитектуре как gRPC-сервис — единственная точка его интеграции с остальным приложением: `gateway-service` выдаёт клиенту временные TURN-креды через REST API. Дальше клиент общается с coturn напрямую по UDP/TCP, минуя всю остальную систему.

---

## 2. Статические vs временные credentials — выбор обязателен

**Статические (не использовать в проде):** один и тот же `username`/`password` зашит в конфиг coturn и в клиента. Проблема — этот креды видны в браузере (DevTools → Network/JS), и ими может воспользоваться кто угодно, кто их подсмотрит, чтобы гонять свой трафик через твой relay-сервер за твой счёт (открытый прокси — реальный вектор злоупотребления, TURN-серверы для этого специально сканируют).

**Временные (TURN REST API credential mechanism, RFC draft-uberti-behave-turn-rest) — обязательны для прода:**

```
username = "<unix-timestamp-истечения>:<userId>"
credential = base64( HMAC-SHA1(sharedSecret, username) )
```

coturn настраивается с `use-auth-secret` и тем же `sharedSecret` — он самостоятельно проверяет HMAC при подключении клиента, без обращения к базе данных или к другим сервисам. Креды при этом живут ограниченное время (например, 1 час) — даже если их кто-то перехватит, они бесполезны после истечения.

**Definition of done для этого пункта:** используются именно временные credentials, `sharedSecret` не попадает в клиентский код (только на сервер `gateway-service` и в конфиг `coturn`).

---

## 3. Конфигурация coturn (`turnserver.conf`)

```conf
listening-port=3478
tls-listening-port=5349

# диапазон портов для релея медиатрафика — САМОЕ важное для сетевой инфраструктуры
min-port=49152
max-port=65535

# публичный IP сервера. Если coturn сам за NAT (например, за 1:1 NAT облачного провайдера) —
# указывается пара "публичный/приватный" явно, coturn не может достоверно определить это сам
external-ip=203.0.113.10

realm=turn.example.com
use-auth-secret
static-auth-secret=<sharedSecret>   # тот же секрет, что использует gateway-service для генерации credential

fingerprint
lt-cred-mech

# защита от использования сервера как открытого relay во внутреннюю сеть — ОБЯЗАТЕЛЬНО
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=127.0.0.0-127.255.255.255

no-cli
no-tcp-relay          # обычно достаточно UDP relay; TCP relay включать только если реально нужен fallback
```

**Почему `denied-peer-ip` критично, а не опционально:** без этого TURN-сервер можно заставить релеить трафик во внутреннюю (приватную) сеть, где он развёрнут — то есть открытый TURN-сервер превращается в инструмент для сканирования/атаки внутренней инфраструктуры извне. Это стандартная рекомендация безопасности для любого публично доступного TURN, не специфика этого проекта.

---

## 4. Docker Compose

```yaml
services:
  coturn:
    image: coturn/coturn:latest
    network_mode: host   # см. пояснение ниже — почему не через обычный port mapping
    volumes:
      - ./infra/coturn/turnserver.conf:/etc/coturn/turnserver.conf:ro
    restart: unless-stopped
```

**Почему `network_mode: host`, а не стандартный `ports:`:** relay-диапазон в примере выше — почти 16000 портов (`49152-65535`). Прописывать это через `-p 49152-65535:49152-65535/udp` в Docker формально возможно, но резко ухудшает производительность (Docker userland-proxy на каждый порт) и на практике для coturn везде рекомендуют host-сеть. Это не "лень", а задокументированная практика самого проекта coturn.

**Важное следствие:** при `host` networking Docker-сеть контейнера — это сеть хоста. Значит, разворачивать coturn стоит на отдельной VM/инстансе, а не в общем Docker Compose со всеми остальными сервисами — иначе конфликты портов и усложнение сетевых политик остальных сервисов. Это уже отражено в общем плане (`Этап 4` — отдельная инфраструктурная единица).

---

## 5. Эндпоинт для выдачи credentials (в `gateway-service`)

```typescript
@UseGuards(JwtAuthGuard)
@Get('turn-credentials')
getTurnCredentials(@CurrentUser() user: JwtPayload) {
  const ttlSeconds = 3600;
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expiry}:${user.sub}`;
  const credential = crypto
    .createHmac('sha1', process.env.TURN_SHARED_SECRET)
    .update(username)
    .digest('base64');

  return {
    urls: ['turn:turn.example.com:3478', 'turns:turn.example.com:5349'],
    username,
    credential,
    ttl: ttlSeconds,
  };
}
```

Клиент дёргает этот эндпоинт **перед** созданием `RTCPeerConnection`, а не хранит креды заранее — они одноразовые по времени жизни звонка.

**Почему это в `gateway-service`, а не в `signaling-service`:** генерация TURN-кредов — чистая криптографическая операция без состояния, не связанная с WebSocket-сессией или комнатами. `gateway-service` уже отвечает за выдачу auth-артефактов клиенту (JWT), TURN-креды концептуально из той же категории — "что-то, что нужно клиенту для авторизованного доступа к инфраструктуре".

---

## 6. Обновление клиента

```typescript
async function getIceServers(): Promise<RTCIceServer[]> {
  const res = await fetch('/turn-credentials', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const { urls, username, credential } = await res.json();

  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls, username, credential },
  ];
}

const pc = new RTCPeerConnection({ iceServers: await getIceServers() });
```

---

## 7. Тест-план: проверка, что TURN реально работает

Definition of done явно требует проверки через принудительное отключение STUN/прямого P2P — вот конкретный воспроизводимый способ:

**Способ 1 — `iceTransportPolicy: 'relay'` (рекомендуется, самый чистый тест):**

```typescript
const pc = new RTCPeerConnection({
  iceServers: await getIceServers(),
  iceTransportPolicy: 'relay', // запрещает host/srflx кандидаты — ТОЛЬКО через TURN relay
});
```

Временно выставить это в тестовом клиенте, повторить сценарий звонка из Этапа 3. Если видео/аудио идут — TURN работает независимо от NAT-топологии, потому что прямой путь физически запрещён самим клиентом.

**Способ 2 — реальная симуляция NAT:** запустить оба тестовых клиента в изолированных Docker-сетях без прямой связности (или через два разных облачных региона с блокировкой P2P на файрволе) и убедиться, что звонок всё равно устанавливается.

**Проверка в `chrome://webrtc-internals`:** в статистике активной `candidate-pair` тип кандидата должен быть `relay` (а не `host`/`srflx`) при включённом Способе 1 — это прямое доказательство, что трафик реально идёт через coturn, а не P2P.

---

## 8. Тест-кейсы

- credential, сгенерированный `gateway-service`, принимается coturn (успешное подключение к TURN)
- credential с истёкшим `expiry` в username — coturn отклоняет подключение
- credential с неверным HMAC (подделанный) — coturn отклоняет подключение
- звонок с `iceTransportPolicy: 'relay'` устанавливается и передаёт медиапотоки — прямое доказательство работы relay
- в `webrtc-internals` активная candidate-pair имеет тип `relay` при принудительном relay-режиме
- coturn отказывается релеить трафик на IP из приватных диапазонов (`denied-peer-ip`) — можно проверить логами coturn при попытке

---

## 9. Что сознательно НЕ входит в этот этап

- Геораспределённые TURN-ноды (несколько регионов) — оптимизация задержки, актуальна для Этапа 8 (production hardening), не блокирует Definition of Done
- TURN over TCP/TLS как основной путь (сейчас только как fallback-опция в конфиге) — большинству клиентов хватит UDP relay
- Автоматическое масштабирование coturn под нагрузкой — отдельная задача, когда появится реальный трафик
