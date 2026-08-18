/* E2E: signaling-service WS → media-service gRPC (SFU-сценарий из п.6 спецификации).
 * Требует запущенных room-service(:50051), media-service(:50052), signaling-service(:3002)
 * и существующего участия user-1/user-2 в комнате room 2500f2ad-... (есть в БД).
 * Запуск: NODE_PATH=<workspace>/node_modules node apps/media-service/test/e2e-signaling.cjs
 */
const jwt = require('jsonwebtoken');
const { io } = require('socket.io-client');

const SIGNALING_URL = 'http://127.0.0.1:3002';
const ROOM_ID = '2500f2ad-9ade-46d6-bd18-42daffd1e679';
const U1 = 'user-1';
const U2 = 'user-2';
const SECRET = 'your-super-secret-jwt-key-change-in-production';

let failures = 0;
function check(name, cond, details) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  ⇐ ${details}`}`);
  if (!cond) failures++;
}

const opusRtp = {
  codecs: [{ mimeType: 'audio/opus', clockRate: 48000, channels: 2, payloadType: 111, rtcpFeedback: [], parameters: { useinbandfec: 1, usedtx: 1 } }],
  encodings: [{ ssrc: 11111111 }],
  headerExtensions: [{ uri: 'urn:ietf:params:rtp-hdrext:sdes:mid', id: 1 }],
};
const vp8Rtp = {
  codecs: [{ mimeType: 'video/VP8', clockRate: 90000, payloadType: 96, rtcpFeedback: [{ type: 'nack', parameter: '' }, { type: 'nack', parameter: 'pli' }], parameters: {} }],
  encodings: [{ ssrc: 22222222 }],
  headerExtensions: [{ uri: 'urn:ietf:params:rtp-hdrext:sdes:mid', id: 1 }],
};

function tokenFor(userId) {
  return jwt.sign({ sub: userId, email: `${userId}@test.local` }, SECRET, { expiresIn: '1h' });
}

function connect(userId) {
  return new Promise((resolve, reject) => {
    const socket = io(`${SIGNALING_URL}/signaling`, {
      auth: { token: tokenFor(userId) },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    const timeout = setTimeout(() => reject(new Error(`connect timeout ${userId}`)), 8000);
    socket.on('connect', () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.on('error', (e) => { clearTimeout(timeout); reject(new Error(`auth error: ${JSON.stringify(e)}`)); });
    socket.on('connect_error', (e) => { clearTimeout(timeout); reject(new Error(`connect_error: ${e.message}`)); });
  });
}

function waitEvent(socket, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload) => { clearTimeout(t); resolve(payload); });
  });
}

// Простой протокол: послать → дождаться ответного события.
function rpc(socket, emitEvent, responseEvent, payload, timeoutMs = 8000) {
  const p = waitEvent(socket, responseEvent, timeoutMs);
  socket.emit(emitEvent, payload);
  return p;
}

async function main() {
  const s1 = await connect(U1);
  const s2 = await connect(U2);
  console.log(`connected: ${U1}, ${U2}`);

  const joinedP1 = waitEvent(s1, 'room-joined');
  s1.emit('join-room', { roomId: ROOM_ID });
  const joined1 = await joinedP1;
  console.log(`u1 room-joined: participants=${joined1.participants.length}, producers=${joined1.producers.length}`);
  check('u1 first in empty room → 0 other participants', joined1.participants.length === 0 && Array.isArray(joined1.producers), JSON.stringify(joined1));

  const joinedP2 = waitEvent(s2, 'room-joined');
  s2.emit('join-room', { roomId: ROOM_ID });
  const joined2 = await joinedP2;
  console.log(`u2 room-joined: participants=${joined2.participants.length}`);
  check('u2 sees u1 in participants', joined2.participants.some((p) => p.userId === U1), JSON.stringify(joined2.participants));

  // u2 получает user-joined об u1? Нет — s1 вошёл раньше. Но s1 должен получить user-joined об u2.
  const userJoinedP1 = waitEvent(s1, 'user-joined');
  const uj = await userJoinedP1;
  check('u1 got user-joined for u2', uj.userId === U2, JSON.stringify(uj));

  // SFU setup для обоих.
  async function sfuSetup(s, user) {
    const rtpCapabilities = await rpc(s, 'get-router-capabilities', 'router-capabilities', { roomId: ROOM_ID });
    check(`${user} got router capabilities`, typeof rtpCapabilities === 'object' && typeof rtpCapabilities.rtpCapabilities === 'string' && rtpCapabilities.rtpCapabilities.length > 100, JSON.stringify(rtpCapabilities).slice(0, 60));
    const rtpCaps = JSON.parse(rtpCapabilities.rtpCapabilities);
    const send = await rpc(s, 'create-transport', 'transport-created', { direction: 'send' });
    const recv = await rpc(s, 'create-transport', 'transport-created', { direction: 'recv' });
    check(`${user} send transport id`, typeof send.id === 'string' && send.id.length > 0, JSON.stringify(send).slice(0, 80));

    const clientDtls = { role: 'client', fingerprints: send.dtlsParameters.fingerprints };
    await rpc(s, 'connect-transport', 'transport-connected', { transportId: send.id, dtlsParameters: clientDtls });
    await rpc(s, 'connect-transport', 'transport-connected', { transportId: recv.id, dtlsParameters: clientDtls });
    check(`${user} recv transport connected`, true);

    return { send, recv, rtpCaps };
  }

  const su1 = await sfuSetup(s1, U1);
  const su2 = await sfuSetup(s2, U2);

  // u1 produce audio+video. Сигнал new-producer должен дойти до u2.
  const npAudioP = waitEvent(s2, 'new-producer');
  const prodA = await rpc(s1, 'produce', 'produced', { transportId: su1.send.id, kind: 'audio', rtpParameters: opusRtp });
  check('u1 produced audio', typeof prodA.producerId === 'string' && prodA.producerId.length > 0, JSON.stringify(prodA));
  const npA = await npAudioP;
  check('u2 got new-producer (audio) with userId u1', npA.userId === U1 && npA.kind === 'audio', JSON.stringify(npA));

  const npVideoP = waitEvent(s2, 'new-producer');
  const prodV = await rpc(s1, 'produce', 'produced', { transportId: su1.send.id, kind: 'video', rtpParameters: vp8Rtp });
  const npV = await npVideoP;
  check('u2 got new-producer (video)', npV.userId === U1 && npV.kind === 'video', JSON.stringify(npV));

  // u2 consume оба и resume.
  const cA = await rpc(s2, 'consume', 'consumed', { transportId: su2.recv.id, producerId: prodA.producerId, rtpCapabilities: su2.rtpCaps });
  check('u2 consumed u1 audio', cA.producerId === prodA.producerId && typeof cA.rtpParameters === 'object', JSON.stringify(cA).slice(0, 100));
  check('u2 consumer created paused', cA.paused === true, JSON.stringify(cA));
  await rpc(s2, 'resume-consumer', 'consumer-resumed', { consumerId: cA.consumerId });
  check('u2 resumed consumer', true);

  // Производим теперь и у u1 (это ключевой сценарий: u1 должен увидеть продюсеров u2 и не сжить соединение).
  const npAtU1P = waitEvent(s1, 'new-producer');
  const prodU2 = await rpc(s2, 'produce', 'produced', { transportId: su2.send.id, kind: 'audio', rtpParameters: opusRtp });
  const npAtU1 = await npAtU1P;
  check('u1 got new-producer from u2', npAtU1.userId === U2 && npAtU1.kind === 'audio', JSON.stringify(npAtU1));

  const cAtU1 = await rpc(s1, 'consume', 'consumed', { transportId: su1.recv.id, producerId: prodU2.producerId, rtpCapabilities: su1.rtpCaps });
  check('u1 consumed u2 audio', cAtU1.producerId === prodU2.producerId);

  // Отключение: u2 leave → u1 должен получить producer-closed на продюсеры u2.
  const closedP = waitEvent(s1, 'producer-closed');
  const leftP = waitEvent(s1, 'user-left');
  s2.emit('leave-room', { roomId: ROOM_ID });
  const closed = await closedP;
  const left = await leftP;
  check('u1 got producer-closed for u2 producer', closed.producerId === prodU2.producerId, JSON.stringify(closed));
  check('u1 got user-left for u2', left.userId === U2, JSON.stringify(left));

  s1.disconnect();
  s2.disconnect();

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});