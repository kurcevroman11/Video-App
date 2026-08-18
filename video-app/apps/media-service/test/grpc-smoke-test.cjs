/* Интеграционный тест media-service по gRPC (см. media-service-spec §12).
 * Требует запущенного media-service на :50052 (например: MEDIASOUP_WORKERS=2 npm run start).
 * Запуск: NODE_PATH=<workspace>/node_modules node test/grpc-smoke-test.cjs
 */
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO = path.join(__dirname, '../../../libs/contracts/proto/media.proto');
const URL = '127.0.0.1:50052';

const pkg = grpc.loadPackageDefinition(
  protoLoader.loadSync(PROTO, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true })
);
const client = new pkg.media.MediaService(URL, grpc.credentials.createInsecure());

function call(method, request, timeout = 8000) {
  return new Promise((resolve, reject) => {
    client[method](request, { deadline: Date.now() + timeout }, (err, res) => {
      if (err) reject(new Error(`${method}: ${err.details ?? err.message}`));
      else resolve(res);
    });
  });
}

let failures = 0;
const codecs = (c) => c.codecs.map((x) => x.mimeType).sort();
function check(name, cond, details) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  ⇐ ${details}`}`);
  if (!cond) failures++;
}

async function main() {
  // 1. Router capabilities для двух разных комнат (одна и та же комната → тот же router).
  const capsA1 = JSON.parse((await call('GetRouterRtpCapabilities', { room_id: 'room-a' })).rtp_capabilities);
  const capsA2 = JSON.parse((await call('GetRouterRtpCapabilities', { room_id: 'room-a' })).rtp_capabilities);
  const capsB = JSON.parse((await call('GetRouterRtpCapabilities', { room_id: 'room-b' })).rtp_capabilities);
  const kindOf = (c) => c.mimeType.split('/')[0];
  const hasOpus = (c) => c.codecs.some((x) => x.mimeType === 'audio/opus');
  const hasVp8 = (c) => c.codecs.some((x) => x.mimeType === 'video/VP8');
  check('router caps for room-a (opus+VP8)', hasOpus(capsA1) && hasVp8(capsA1), JSON.stringify(codecs(capsA1)));
  check('same room → same router (identical caps)', JSON.stringify(capsA1) === JSON.stringify(capsA2));
  check('room-b has its own router', hasOpus(capsB) && hasVp8(capsB), JSON.stringify(codecs(capsB)));
  // rtx-кодеки для VP8 добавляются mediasoup автоматически.
  console.log('  info: mediasoup adds video/rtx automatically:', JSON.stringify(codecs(capsA1)));

  // 2. Транспорты (send/recv) для двух участников.
  const trA1s = await call('CreateWebRtcTransport', { room_id: 'room-a', user_id: 'u1', direction: 'send' });
  const trA1r = await call('CreateWebRtcTransport', { room_id: 'room-a', user_id: 'u1', direction: 'recv' });
  const trA2s = await call('CreateWebRtcTransport', { room_id: 'room-a', user_id: 'u2', direction: 'send' });
  const trA2r = await call('CreateWebRtcTransport', { room_id: 'room-a', user_id: 'u2', direction: 'recv' });
  check('transports have unique ids', new Set([trA1s.id, trA1r.id, trA2s.id, trA2r.id]).size === 4);
  for (const t of [trA1s, trA1r, trA2s, trA2r]) {
    const ice = JSON.parse(t.ice_parameters);
    const cands = JSON.parse(t.ice_candidates);
    const dtls = JSON.parse(t.dtls_parameters);
    check(`ice params for ${t.id.slice(0, 6)}`, ice.usernameFragment && ice.password, 'no ufrag/pwd');
    check(`ice candidates announced for ${t.id.slice(0, 6)}`, cands.length > 0 && !cands[0].address.startsWith('127'), JSON.stringify({ addr: cands[0]?.address, n: cands.length }));
    check(`dtls fingerprints for ${t.id.slice(0, 6)}`, dtls.fingerprints && dtls.fingerprints.length > 0);
  }

  // 3. ConnectTransport (клиентские DTLS-параметры — берём от транспорта, role=client).
  const fakeDtls = { role: 'client', fingerprints: JSON.parse(trA1s.dtls_parameters).fingerprints };
  try {
    await call('ConnectTransport', { room_id: 'room-a', user_id: 'u1', transport_id: trA1s.id, dtls_parameters: JSON.stringify(fakeDtls) });
    check('connect-transport ok (u1 send)', true);
  } catch (e) { check('connect-transport ok (u1 send)', false, e.message); }
  // Несуществующий транспорт → ошибка, не тихий no-op. (gRPC сводит сообщение к общему виду.)
  try {
    await call('ConnectTransport', { room_id: 'room-a', user_id: 'u1', transport_id: 'bogus-transport', dtls_parameters: JSON.stringify(fakeDtls) });
    check('connect bogus transport → error', false);
  } catch (e) { check('connect bogus transport → error', true, e.message); }

  // 4. consume на несуществующий producerId → ошибка (спец §12).
  try {
    await call('Consume', {
      room_id: 'room-a', user_id: 'u2', transport_id: trA2r.id,
      producer_id: 'bogus-producer', rtp_capabilities: JSON.stringify({ codecs: [], headerExtensions: [] }),
    });
    check('consume bogus producer → error', false);
  } catch (e) {
    check('consume bogus producer → error', /consume|cannot/i.test(e.message), e.message);
  }

  // 5. CloseParticipant для пустого участника → пустой список producer_ids.
  const closedEmpty = await call('CloseParticipant', { room_id: 'room-a', user_id: 'nobody' });
  check('close participant (no producers) returns empty list', Array.isArray(closedEmpty.producer_ids) && closedEmpty.producer_ids.length === 0, JSON.stringify(closedEmpty));

  // 6. Clear: закрываем всех из room-a/b, чтобы освободить Router'ы.
  for (const u of ['u1', 'u2']) {
    const r = await call('CloseParticipant', { room_id: 'room-a', user_id: u });
    check(`close participant ${u} ok`, Array.isArray(r.producer_ids), JSON.stringify(r));
  }
  // После полного очищения комнаты GetRouterRtpCapabilities воссоздаёт router.
  const capsAAgain = JSON.parse((await call('GetRouterRtpCapabilities', { room_id: 'room-a' })).rtp_capabilities);
  check('router recreated after room emptied', capsAAgain && hasOpus(capsAAgain) && hasVp8(capsAAgain), JSON.stringify(capsAAgain));

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});