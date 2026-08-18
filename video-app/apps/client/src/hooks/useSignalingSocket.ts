import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export type MediaKind = 'audio' | 'video';

export interface RemoteProducerInfo {
  producerId: string;
  userId: string;
  kind: MediaKind;
}

export interface TransportParams {
  id: string;
  iceParameters: any;
  iceCandidates: any;
  dtlsParameters: any;
}

export interface ConsumerParams {
  consumerId: string;
  producerId: string;
  kind: MediaKind;
  paused: boolean;
  rtpParameters: any;
}

export interface SignalingEvents {
  onRoomJoined?: (data: {
    participants: { userId: string }[];
    producers: RemoteProducerInfo[];
  }) => void;
  onRoomLeft?: (roomId: string) => void;
  onUserJoined?: (userId: string) => void;
  onUserLeft?: (userId: string) => void;
  onNewProducer?: (producer: RemoteProducerInfo) => void;
  onProducerClosed?: (producerId: string) => void;
  onError?: (data: { code: string; message: string }) => void;
  onDisconnect?: () => void;
  onReconnect?: () => void;
}

export interface UseSignalingSocketReturn {
  socket: Socket | null;
  connect: (token: string) => void;
  disconnect: () => void;
  updateToken: (token: string) => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: (roomId: string) => void;
  getRouterCapabilities: (roomId: string) => Promise<any>;
  createTransport: (direction: 'send' | 'recv') => Promise<TransportParams>;
  connectTransport: (transportId: string, dtlsParameters: any) => Promise<void>;
  produce: (
    transportId: string,
    kind: MediaKind,
    rtpParameters: any
  ) => Promise<{ producerId: string; kind: MediaKind }>;
  consume: (
    transportId: string,
    producerId: string,
    rtpCapabilities: any
  ) => Promise<ConsumerParams>;
  resumeConsumer: (consumerId: string) => Promise<void>;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT_MS = 15000;

export function useSignalingSocket(
  signalingUrl: string,
  events: SignalingEvents
): UseSignalingSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const hasConnectedRef = useRef(false);
  const eventsRef = useRef(events);
  const pendingQueuesRef = useRef<Map<string, PendingRequest[]>>(new Map());

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const updateToken = useCallback((token: string) => {
    if (socketRef.current) {
      socketRef.current.auth = { token };
    }
  }, []);

  const settleEvent = useCallback((event: string, payload: any) => {
    const q = pendingQueuesRef.current.get(event);
    if (q && q.length > 0) {
      const pending = q.shift();
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve(payload);
      }
    }
  }, []);

  const rejectAllPending = useCallback((message: string) => {
    pendingQueuesRef.current.forEach((queue) => {
      while (queue.length > 0) {
        const pending = queue.shift();
        if (pending) {
          clearTimeout(pending.timer);
          pending.reject(new Error(message));
        }
      }
    });
  }, []);

  const connect = useCallback(
    (token: string) => {
      if (socketRef.current?.connected) return;

      const socket = io(`${signalingUrl}/signaling`, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
      });
      socketRef.current = socket;
      setSocket(socket);

      // Ответы на наши gRPC-запросы, проброшенные signaling'ом.
      socket.on('router-capabilities', (data: { rtpCapabilities: any }) =>
        settleEvent('router-capabilities', data.rtpCapabilities)
      );
      socket.on('transport-created', (data: any) => settleEvent('transport-created', data));
      socket.on('transport-connected', (data: { transportId: string }) =>
        settleEvent('transport-connected', data.transportId)
      );
      socket.on('produced', (data: { producerId: string; kind: MediaKind }) =>
        settleEvent('produced', { producerId: data.producerId, kind: data.kind })
      );
      socket.on('consumed', (data: any) => settleEvent('consumed', data));
      socket.on('consumer-resumed', (data: { consumerId: string }) =>
        settleEvent('consumer-resumed', data.consumerId)
      );

      // Транслируемые события комнаты.
      socket.on('connect', () => {
        console.log('Signaling socket connected');
        const reconnecting = hasConnectedRef.current;
        hasConnectedRef.current = true;
        if (reconnecting) {
          eventsRef.current.onReconnect?.();
        }
      });

      socket.on('disconnect', (reason) => {
        console.log('Signaling socket disconnected', reason);
        rejectAllPending('Signaling socket disconnected');
        eventsRef.current.onDisconnect?.();
      });

      socket.on('room-joined', (data: {
        participants: { userId: string }[];
        producers: RemoteProducerInfo[];
      }) => {
        eventsRef.current.onRoomJoined?.(data);
      });

      socket.on('room-left', ({ roomId }: { roomId: string }) => {
        eventsRef.current.onRoomLeft?.(roomId);
      });

      socket.on('user-joined', ({ userId }: { userId: string }) => {
        eventsRef.current.onUserJoined?.(userId);
      });

      socket.on('user-left', ({ userId }: { userId: string }) => {
        eventsRef.current.onUserLeft?.(userId);
      });

      socket.on('new-producer', (data: RemoteProducerInfo) => {
        eventsRef.current.onNewProducer?.(data);
      });

      socket.on('producer-closed', ({ producerId }: { producerId: string }) => {
        eventsRef.current.onProducerClosed?.(producerId);
      });

      socket.on('error', ({ code, message }: { code: string; message: string }) => {
        eventsRef.current.onError?.({ code, message });
      });
    },
    [signalingUrl, rejectAllPending, settleEvent]
  );

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setSocket(null);
  }, []);

  const request = useCallback(
    (event: string, payload: any, responseEvent: string): Promise<any> => {
      return new Promise((resolve, reject) => {
        const socket = socketRef.current;
        if (!socket) {
          reject(new Error('Socket not connected'));
          return;
        }

        const pending: PendingRequest = {
          resolve,
          reject,
          timer: setTimeout(() => reject(new Error(`Timeout waiting for ${responseEvent}`)), REQUEST_TIMEOUT_MS),
        };

        const q = pendingQueuesRef.current.get(responseEvent) ?? [];
        q.push(pending);
        pendingQueuesRef.current.set(responseEvent, q);

        socket.emit(event, payload);
      });
    },
    []
  );

  const joinRoom = useCallback((roomId: string) => {
    socketRef.current?.emit('join-room', { roomId });
  }, []);

  const leaveRoom = useCallback((roomId: string) => {
    socketRef.current?.emit('leave-room', { roomId });
  }, []);

  const getRouterCapabilities = useCallback(
    (roomId: string) => request('get-router-capabilities', { roomId }, 'router-capabilities'),
    [request]
  );

  const createTransport = useCallback(
    (direction: 'send' | 'recv') => request('create-transport', { direction }, 'transport-created'),
    [request]
  );

  const connectTransport = useCallback(
    (transportId: string, dtlsParameters: any) =>
      request('connect-transport', { transportId, dtlsParameters }, 'transport-connected'),
    [request]
  );

  const produce = useCallback(
    (transportId: string, kind: MediaKind, rtpParameters: any) =>
      request('produce', { transportId, kind, rtpParameters }, 'produced'),
    [request]
  );

  const consume = useCallback(
    (transportId: string, producerId: string, rtpCapabilities: any) =>
      request('consume', { transportId, producerId, rtpCapabilities }, 'consumed'),
    [request]
  );

  const resumeConsumer = useCallback(
    (consumerId: string) => request('resume-consumer', { consumerId }, 'consumer-resumed'),
    [request]
  );

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  return {
    socket,
    connect,
    disconnect,
    updateToken,
    joinRoom,
    leaveRoom,
    getRouterCapabilities,
    createTransport,
    connectTransport,
    produce,
    consume,
    resumeConsumer,
  };
}