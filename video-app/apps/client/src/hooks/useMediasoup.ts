import { useRef, useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { Device, types as mediasoupTypes } from 'mediasoup-client';
import {
  UseSignalingSocketReturn,
  RemoteProducerInfo,
  ConsumerParams,
} from './useSignalingSocket';

export interface RemoteParticipant {
  userId: string;
  stream: MediaStream;
}

export interface UseMediasoupReturn {
  deviceLoaded: boolean;
  remoteParticipants: RemoteParticipant[];
  connectionState: mediasoupTypes.ConnectionState;
  close: () => void;
}

/**
 * SFU-сценарий из п.6 спецификации media-service:
 * 1. get-router-capabilities → device.load()
 * 2. create-transport(send) и (recv), затем connect-transport обоих
 * 3. produce локальных аудио/видео треков через send-transport
 * 4. consume чужих Producer'ов через recv-transport, resume-consumer после подключения трека
 * Клиент НИКОГДА не создаёт RTCPeerConnection к другим участникам — "собеседник" всегда SFU.
 */
export function useMediasoup(
  socket: Socket | null,
  signaling: UseSignalingSocketReturn,
  roomId: string,
  userId: string,
  localStream: MediaStream | null
): UseMediasoupReturn {
  const [deviceLoaded, setDeviceLoaded] = useState(false);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [connectionState, setConnectionState] = useState<mediasoupTypes.ConnectionState>('new');

  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<mediasoupTypes.Transport | null>(null);
  const recvTransportRef = useRef<mediasoupTypes.Transport | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const participantsRef = useRef<Map<string, MediaStream>>(new Map());
  const consumerByProducerRef = useRef<Map<string, mediasoupTypes.Consumer>>(new Map());
  const producedKindsRef = useRef<Set<string>>(new Set());
  const pendingProducersRef = useRef<RemoteProducerInfo[]>([]);
  const startedRef = useRef(false);

  localStreamRef.current = localStream;

  const addTrackToParticipant = useCallback((participantUserId: string, track: MediaStreamTrack) => {
    let stream = participantsRef.current.get(participantUserId);
    if (!stream) {
      stream = new MediaStream();
      participantsRef.current.set(participantUserId, stream);
    }
    stream.addTrack(track);
    setRemoteParticipants([...participantsRef.current.entries()].map(([userId, s]) => ({ userId, stream: s })));
  }, []);

  const removeTrackFromParticipant = useCallback(
    (participantUserId: string, track: MediaStreamTrack) => {
      const stream = participantsRef.current.get(participantUserId);
      if (stream) {
        stream.removeTrack(track);
        if (stream.getTracks().length === 0) {
          participantsRef.current.delete(participantUserId);
        }
      }
      setRemoteParticipants([...participantsRef.current.entries()].map(([userId, s]) => ({ userId, stream: s })));
    },
    []
  );

  const closeConsumer = useCallback(
    (producerId: string) => {
      const consumer = consumerByProducerRef.current.get(producerId);
      if (!consumer) return;
      const peerUserId = (consumer.appData as any).userId as string;
      const track = consumer.track;
      consumer.close();
      consumerByProducerRef.current.delete(producerId);
      if (peerUserId && track) {
        removeTrackFromParticipant(peerUserId, track);
      }
    },
    [removeTrackFromParticipant]
  );

  const consumeProducer = useCallback(
    async (producer: RemoteProducerInfo) => {
      const device = deviceRef.current;
      const transport = recvTransportRef.current;
      // recv-транспорт может быть ещё не создан (setup() не завершён):
      // не выбрасываем продюсер, а буферизуем до конца setup().
      if (!device || !transport) {
        if (!pendingProducersRef.current.some((p) => p.producerId === producer.producerId)) {
          pendingProducersRef.current.push(producer);
        }
        return;
      }
      if (consumerByProducerRef.current.has(producer.producerId)) return;
      if (producer.userId === userId) return;

      try {
        const params: ConsumerParams = await signaling.consume(
          transport.id,
          producer.producerId,
          device.recvRtpCapabilities
        );

        if (consumerByProducerRef.current.has(producer.producerId)) return;

        const consumer = await transport.consume({
          id: params.consumerId,
          producerId: params.producerId,
          kind: params.kind as mediasoupTypes.MediaKind,
          rtpParameters: params.rtpParameters,
          appData: { userId: producer.userId },
        });

        consumerByProducerRef.current.set(producer.producerId, consumer);
        addTrackToParticipant(producer.userId, consumer.track);

        consumer.on('trackended', () => closeConsumer(producer.producerId));
        consumer.on('@close', () => {
          consumerByProducerRef.current.delete(producer.producerId);
        });

        // Consumer создан на сервере на паузе (см. п.7 спецификации) —
        // трек уже прикреплён, теперь разрешаем delivery.
        await signaling.resumeConsumer(consumer.id);
      } catch (error: any) {
        console.error(`Failed to consume producer ${producer.producerId}: ${error.message}`);
      }
    },
    [userId, signaling, addTrackToParticipant, closeConsumer]
  );

  const setup = useCallback(async () => {
    if (!socket || startedRef.current) return;
    startedRef.current = true;

    try {
      const rtpCapabilitiesRaw = await signaling.getRouterCapabilities(roomId);
      // signaling передаёт rtpCapabilities как JSON-строку (gRPC → WS), а Device.load()
      // ожидает объект — явно парсим.
      const rtpCapabilities =
        typeof rtpCapabilitiesRaw === 'string'
          ? JSON.parse(rtpCapabilitiesRaw)
          : rtpCapabilitiesRaw;
      const device = new Device();
      await device.load({ routerRtpCapabilities: rtpCapabilities });
      deviceRef.current = device;
      setDeviceLoaded(true);

      // send-transport
      const sendParams = await signaling.createTransport('send');
      sendTransportRef.current = device.createSendTransport({
        id: sendParams.id,
        iceParameters: sendParams.iceParameters,
        iceCandidates: sendParams.iceCandidates,
        dtlsParameters: sendParams.dtlsParameters,
      });

      sendTransportRef.current.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await signaling.connectTransport(sendParams.id, dtlsParameters);
          callback();
        } catch (error: any) {
          errback(error);
        }
      });

      sendTransportRef.current.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
        try {
          const { producerId } = await signaling.produce(sendParams.id, kind, rtpParameters);
          callback({ id: producerId });
        } catch (error: any) {
          errback(error);
        }
      });

      sendTransportRef.current.on('connectionstatechange', (state) => {
        console.log(`[sfu] sendTransport state=${state}`);
        setConnectionState((prev) => (state === 'connected' ? 'connected' : prev));
      });

      // recv-transport
      const recvParams = await signaling.createTransport('recv');
      recvTransportRef.current = device.createRecvTransport({
        id: recvParams.id,
        iceParameters: recvParams.iceParameters,
        iceCandidates: recvParams.iceCandidates,
        dtlsParameters: recvParams.dtlsParameters,
      });

      recvTransportRef.current.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await signaling.connectTransport(recvParams.id, dtlsParameters);
          callback();
        } catch (error: any) {
          errback(error);
        }
      });

      recvTransportRef.current.on('connectionstatechange', (state) => {
        console.log(`[sfu] recvTransport state=${state}`);
        setConnectionState((prev) => (state === 'connected' ? 'connected' : prev));
      });

      // Начало публикации локального медиа — по одному Producer'у на аудио и видео.
      const tracks = localStreamRef.current?.getTracks() ?? [];
      for (const track of tracks) {
        const kind = track.kind as 'audio' | 'video';
        if (producedKindsRef.current.has(kind)) continue;
        producedKindsRef.current.add(kind);
        const producer = await sendTransportRef.current.produce({ track });
        console.log(`[sfu] produced ${kind} → ${producer.id}`);
      }

      // Буферизованные продюсеры, пришедшие до готовности recv-транспорта.
      const pending = pendingProducersRef.current.splice(0);
      await Promise.all(pending.map((producer) => consumeProducer(producer)));
    } catch (error: any) {
      console.error('[sfu] setup failed:', error.message);
      startedRef.current = false;
    }
  }, [socket, roomId, signaling]);

  const teardown = useCallback(() => {
    for (const producerId of consumerByProducerRef.current.keys()) {
      closeConsumer(producerId);
    }
    consumerByProducerRef.current.clear();
    producedKindsRef.current.clear();
    participantsRef.current.forEach((stream) => {
      stream.getTracks().forEach((t) => t.stop());
    });
    participantsRef.current.clear();
    setRemoteParticipants([]);
    try {
      sendTransportRef.current?.close();
      recvTransportRef.current?.close();
    } catch {
      /* ignore */
    }
    sendTransportRef.current = null;
    recvTransportRef.current = null;
    deviceRef.current = null;
    setDeviceLoaded(false);
    setConnectionState('new');
    startedRef.current = false;
  }, [closeConsumer]);

  // Получение новых чужих Producer'ов (кто-то включил камеру/микрофон).
  useEffect(() => {
    if (!socket) return;
    const onNewProducer = (producer: RemoteProducerInfo) => {
      consumeProducer(producer);
    };
    socket.on('new-producer', onNewProducer);
    return () => {
      socket.off('new-producer', onNewProducer);
    };
  }, [socket, consumeProducer]);

  // Закрытие чужих Producer'ов (участник отключился/выключил камеру).
  useEffect(() => {
    if (!socket) return;
    const onProducerClosed = ({ producerId }: { producerId: string }) => {
      closeConsumer(producerId);
    };
    socket.on('producer-closed', onProducerClosed);
    return () => {
      socket.off('producer-closed', onProducerClosed);
    };
  }, [socket, closeConsumer]);

  // Инициализация SFU после входа в комнату (data.producers = уже существующие Producer'ы).
  useEffect(() => {
    if (!socket) return;
    const onRoomJoined = (data: { producers: RemoteProducerInfo[] }) => {
      if (!startedRef.current) setup();
      data.producers
        .filter((p) => p.userId !== userId)
        .forEach((producer) => {
          consumeProducer(producer);
        });
    };
    const onRoomLeft = () => teardown();
    socket.on('room-joined', onRoomJoined);
    socket.on('room-left', onRoomLeft);
    return () => {
      socket.off('room-joined', onRoomJoined);
      socket.off('room-left', onRoomLeft);
    };
  }, [socket, setup, consumeProducer, teardown, userId]);

  useEffect(() => {
    return () => {
      teardown();
    };
  }, [teardown]);

  const close = useCallback(() => {
    teardown();
  }, [teardown]);

  return {
    deviceLoaded,
    remoteParticipants,
    connectionState,
    close,
  };
}