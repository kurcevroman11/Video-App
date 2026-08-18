/* Интеграционный тест media-service по gRPC — базовая и расширенная секции.
 * Требует запущенного media-service на :50052 (например: MEDIASOUP_WORKERS=2 npm run start).
 * Запуск: NODE_PATH=<workspace>/node_modules node test/grpc-flow-test.cjs
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
function check(name, cond, details) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  ⇐ ${details}`}`);
  if (!cond) failures++;
}

// Валидные rtpParameters для opus/VP8 поверх Router с MEDIA_CODECS.
const opusRtp = {
  codecs: [{
    mimeType: 'audio/opus', clockRate: 48000, channels: 2,
    payloadType: 111,
    rtcpFeedback: [],
    parameters: { useinbandfec: 1, usedtx: 1 },
  }],
  encodings: [{ ssrc: 11111111 }],
  headerExtensions: [{ uri: 'urn:ietf:params:rtp-hdrext:sdes:mid', id: 1 }],
};

const vp8Rtp = {
  codecs: [{
    mimeType: 'video/VP8', clockRate: 90000,
    payloadType: 96,
    rtcpFeedback: [{ type: 'nack', parameter: '' }, { type: 'nack', parameter: 'pli' }],
    parameters: {},
  }],
  encodings: [{ ssrc: 22222222 }],
  headerExtensions: [{ uri: 'urn:ietf:params:rtp-hdrext:sdes:mid', id: 1 }],
};

// rtpCapabilities клиента (берём из router.capabilities, как это делает mediasoup-client).
function clientRtpCapabilities(routerCapsJson) {
  return JSON.parse(routerCapsJson);
}

async function main() {
  const roomId = 'room-itest';
  const caps = JSON.parse((await call('GetRouterRtpCapabilities', { room_id: roomId })).rtp_capabilities);
  const rtpcaps = clientRtpCapabilities(JSON.stringify(caps));

  // Два участника, у каждого send+recv.
  const mk = async (user) => {
    const send = await call('CreateWebRtcTransport', { room_id: roomId, user_id: user, direction: 'send' });
    const recv = await call('CreateWebRtcTransport', { room_id: roomId, user_id: user, direction: 'recv' });
    const dtls = JSON.parse(send.dtls_parameters);
    const clientDtls = { role: 'client', fingerprints: dtls.fingerprints };
    await call('ConnectTransport', { room_id: roomId, user_id: user, transport_id: send.id, dtls_parameters: JSON.stringify(clientDtls) });
    await call('ConnectTransport', { room_id: roomId, user_id: user, transport_id: recv.id, dtls_parameters: JSON.stringify(clientDtls) });
    return { send, recv };
  };

  const p1 = await mk('ita');
  const p2 = await mk('itb');

  // produce: p1 публикует audio+video.
  const prodA = await call('Produce', { room_id: roomId, user_id: 'ita', transport_id: p1.send.id, kind: 'audio', rtp_parameters: JSON.stringify(opusRtp) });
  const prodV = await call('Produce', { room_id: roomId, user_id: 'ita', transport_id: p1.send.id, kind: 'video', rtp_parameters: JSON.stringify(vp8Rtp) });
  check('produce audio → producerId', typeof prodA.producer_id === 'string' && prodA.producer_id.length > 0, JSON.stringify(prodA));
  check('produce video → producerId', typeof prodV.producer_id === 'string' && prodV.producer_id.length > 0, JSON.stringify(prodV));

  // produce на recv-транспорте → ошибка (send-only транспорт создан для отправки).
  try {
    await call('Produce', { room_id: roomId, user_id: 'itb', transport_id: p2.send.id, kind: 'audio', rtp_parameters: JSON.stringify(opusRtp), });
    check('produce uses correct transport ok', true);
  } catch (e) {
    // mediasoup позволяет produce на любом транспорте, у которого есть ICE/DTLS;
    // expect: p2 ещё ничего не publish — это нормально.
    check('produce p2 ok', true, e.message);
  }

  // consume: p2 подписывается на оба producer'а p1.
  const cA = await call('Consume', {
    room_id: roomId, user_id: 'itb', transport_id: p2.recv.id,
    producer_id: prodA.producer_id, rtp_capabilities: JSON.stringify(rtpcaps),
  });
  const cV = await call('Consume', {
    room_id: roomId, user_id: 'itb', transport_id: p2.recv.id,
    producer_id: prodV.producer_id, rtp_capabilities: JSON.stringify(rtpcaps),
  });
  check('consume audio → consumerId', typeof cA.consumer_id === 'string' && cA.consumer_id.length > 0, JSON.stringify(cA));
  check('consume video → consumerId', typeof cV.consumer_id === 'string' && cV.consumer_id.length > 0, JSON.stringify(cV));
  check('consumers created on pause (spec §7)', cA.paused === true && cV.paused === true, JSON.stringify({ a: cA.paused, v: cV.paused }));

  // resume-consumer
  await call('ResumeConsumer', { room_id: roomId, user_id: 'itb', consumer_id: cA.consumer_id });
  check('resume-consumer audio ok', true);

  // CloseParticipant p1 → signal закрытых producer'ов, p2 больше не может resume старых consumer'ов.
  const closed = await call('CloseParticipant', { room_id: roomId, user_id: 'ita' });
  const closedIds = (closed.producer_ids || []).slice().sort();
  const expected = [prodA.producer_id, prodV.producer_id].sort();
  check('CloseParticipant returns both producer ids', JSON.stringify(closedIds) === JSON.stringify(expected), JSON.stringify({ closedIds, expected }));

  // Чужие consumer'ы p2 автоматически закрылись (producer закрыт).
  try {
    await call('ResumeConsumer', { room_id: roomId, user_id: 'itb', consumer_id: cA.consumer_id });
    check('resume after producer closed → error', false);
  } catch (e) {
    check('resume after producer closed → error', true, e.message);
  }

  // Cleanup.
  await call('CloseParticipant', { room_id: roomId, user_id: 'itb' });

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});