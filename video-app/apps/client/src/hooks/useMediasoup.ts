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
  source: 'camera' | 'screen';
  stream: MediaStream;
}

export interface UseMediasoupReturn {
  deviceLoaded: boolean;
  remoteParticipants: RemoteParticipant[];
  connectionState: mediasoupTypes.ConnectionState;
  screenSharing: boolean;
  localScreenStream: MediaStream | null;
  startScreenShare: () => Promise<boolean>;
  stopScreenShare: () => void;
  close: () => void;
}

function streamKey(userId: string, source: 'camera' | 'screen'): string {
  return `${userId}:${source}`;
}

/**
 * SFU-сценарий из п.6 спецификации media-service:
 * 1. get-router-capabilities → device.load()
 * 2. create-transport(send) и (recv), затем connect-transport обоих
 * 3. produce локальных аудио/видео треков через send-transport
 * 4. consume чужих Producer'ов через recv-transport, resume-consumer после подключения трека
 * Клиент НИКОГДА не создаёт RTCPeerConnection к другим участникам — "собеседник" всегда SFU.
 *
 * Демонстрация экрана — ещё один Producer с appData { source: 'screen' }.
 * На клиенте камера и демо рендерятся по-разному (демо — крупно).
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
  const [screenSharing, setScreenSharing] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);

  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<mediasoupTypes.Transport | null>(null);
  const recvTransportRef = useRef<mediasoupTypes.Transport | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const streamsRef = useRef<Map<string, RemoteParticipant>>(new Map());
  const consumerByProducerRef = useRef<Map<string, mediasoupTypes.Consumer>>(new Map());
  const producedKindsRef = useRef<Set<string>>(new Set());
  const pendingProducersRef = useRef<RemoteProducerInfo[]>([]);
  const startedRef = useRef(false);
  const screenProducerRef = useRef<mediasoupTypes.Producer | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  localStreamRef.current = localStream;

  const refreshRemoteParticipants = useCallback(() => {
    setRemoteParticipants(Array.from(streamsRef.current.values()));
  }, []);

  const addTrackToParticipant = useCallback(
    (producer: RemoteProducerInfo, track: MediaStreamTrack) => {
      const source = producer.source === 'screen' ? 'screen' : 'camera';
      const key = streamKey(producer.userId, source);
      let entry = streamsRef.current.get(key);
      if (!entry) {
        entry = { userId: producer.userId, source, stream: new MediaStream() };
        streamsRef.current.set(key, entry);
      }
      if (entry.stream.getTracks().some((t) => t.id === track.id)) return;
      entry.stream.addTrack(track);
      refreshRemoteParticipants();
    },
    [refreshRemoteParticipants]
  );

  const removeTrackFromParticipant = useCallback(
    (participantUserId: string, source: 'camera' | 'screen', track: MediaStreamTrack) => {
      const key = streamKey(participantUserId, source);
      const entry = streamsRef.current.get(key);
      if (entry) {
        entry.stream.removeTrack(track);
        if (entry.stream.getTracks().length === 0) {
          streamsRef.current.delete(key);
        }
      }
      refreshRemoteParticipants();
    },
    [refreshRemoteParticipants]
  );

  const closeConsumer = useCallback(
    (producerId: string) => {
      const consumer = consumerByProducerRef.current.get(producerId);
      if (!consumer) return;
      const appData = consumer.appData as { userId: string; source: 'camera' | 'screen' };
      const track = consumer.track;
      consumer.close();
      consumerByProducerRef.current.delete(producerId);
      if (appData?.userId && track) {
        removeTrackFromParticipant(appData.userId, appData.source ?? 'camera', track);
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
          appData: {
            userId: producer.userId,
            source: producer.source === 'screen' ? 'screen' : 'camera',
          },
        });

        consumerByProducerRef.current.set(producer.producerId, consumer);
        addTrackToParticipant(producer, consumer.track);

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

      sendTransportRef.current.on(
        'produce',
        async ({ kind, rtpParameters, appData }, callback, errback) => {
          try {
            const source =
              (appData as { source?: 'camera' | 'screen' } | undefined)?.source === 'screen'
                ? 'screen'
                : 'camera';
            const { producerId } = await signaling.produce(sendParams.id, kind, rtpParameters, {
              source,
            });
            callback({ id: producerId });
          } catch (error: any) {
            errback(error);
          }
        }
      );

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

  const stopScreenShare = useCallback(
    (producerId?: string) => {
      const producer = screenProducerRef.current;
      if (producer) {
        const id = producerId ?? producer.id;
        if (id) signaling.stopScreenShare(id);
        try {
          producer.close();
        } catch {
          /* ignore */
        }
        screenProducerRef.current = null;
      }
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      setLocalScreenStream(null);
      setScreenSharing(false);
    },
    [signaling]
  );

  /**
   * Запуск демонстрации экрана: единственное отличие от камеры — appData source='screen'.
   * Возвращает false, если пользователь отменил выбор окна/экрана.
   */
  const startScreenShare = useCallback(async (): Promise<boolean> => {
    const sendTransport = sendTransportRef.current;
    if (!sendTransport || screenProducerRef.current) return false;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch {
      return false; // пользователь отменил выбор окна/экрана
    }
    const track = stream.getVideoTracks()[0];
    if (!track) {
      stream.getTracks().forEach((t) => t.stop());
      return false;
    }

    try {
      const producer = await sendTransport.produce({
        track,
        appData: { source: 'screen' },
      });
      screenProducerRef.current = producer;
      screenStreamRef.current = stream;
      setLocalScreenStream(stream);
      setScreenSharing(true);

      // Ловим остановку демонстрации и через нативную кнопку браузера "Stop sharing",
      // и через явный клик "Остановить показ" в приложении (stopScreenShare вручную
      // вызывает тот же emit, здесь только обработка onended).
      track.onended = () => {
        stopScreenShare(producer.id);
      };
      return true;
    } catch (error: any) {
      console.error('[sfu] screen share produce failed:', error.message);
      stream.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setLocalScreenStream(null);
      setScreenSharing(false);
      return false;
    }
  }, [socket, stopScreenShare]);

  const teardown = useCallback(() => {
    for (const producerId of consumerByProducerRef.current.keys()) {
      closeConsumer(producerId);
    }
    consumerByProducerRef.current.clear();
    producedKindsRef.current.clear();
    streamsRef.current.forEach((entry) => {
      entry.stream.getTracks().forEach((t) => t.stop());
    });
    streamsRef.current.clear();
    setRemoteParticipants([]);
    stopScreenShare();
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
  }, [closeConsumer, stopScreenShare]);

  // Получение новых чужих Producer'ов (кто-то включил камеру/микрофон/начал демонстрацию).
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

  // Закрытие чужих Producer'ов (участник отключился/выключил камеру/остановил демонстрацию).
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

  const teardownRef = useRef(teardown);
  teardownRef.current = teardown;
  useEffect(() => {
    return () => {
      teardownRef.current();
    };
  }, []);

  const close = useCallback(() => {
    teardown();
  }, [teardown]);

  return {
    deviceLoaded,
    remoteParticipants,
    connectionState,
    screenSharing,
    localScreenStream,
    startScreenShare,
    stopScreenShare,
    close,
  };
}