import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export interface SignalingEvents {
  onUserJoined?: (userId: string) => void;
  onUserLeft?: () => void;
  onOffer?: (data: { userId: string; sdp: RTCSessionDescriptionInit }) => void;
  onAnswer?: (data: { userId: string; sdp: RTCSessionDescriptionInit }) => void;
  onIceCandidate?: (data: { userId: string; candidate: RTCIceCandidateInit }) => void;
  onRoomJoined?: (participants: { userId: string }[]) => void;
  onError?: (data: { code: string; message: string }) => void;
}

export interface UseSignalingSocketReturn {
  socket: Socket | null;
  connect: (token: string) => void;
  disconnect: () => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: (roomId: string) => void;
  sendOffer: (targetUserId: string, sdp: RTCSessionDescriptionInit) => void;
  sendAnswer: (targetUserId: string, sdp: RTCSessionDescriptionInit) => void;
  sendIceCandidate: (targetUserId: string, candidate: RTCIceCandidateInit) => void;
}

export function useSignalingSocket(
  signalingUrl: string,
  events: SignalingEvents
): UseSignalingSocketReturn {
  const socketRef = useRef<Socket | null>(null);

  const connect = useCallback((token: string) => {
    if (socketRef.current?.connected) return;

    const socket = io(`${signalingUrl}/signaling`, {
      auth: { token },
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('Signaling socket connected');
    });

    socket.on('disconnect', () => {
      console.log('Signaling socket disconnected');
    });

    socket.on('room-joined', ({ participants }: { participants: { userId: string }[] }) => {
      events.onRoomJoined?.(participants);
    });

    socket.on('user-joined', ({ userId }: { userId: string }) => {
      events.onUserJoined?.(userId);
    });

    socket.on('user-left', () => {
      events.onUserLeft?.();
    });

    socket.on('offer', ({ userId, sdp }: { userId: string; sdp: RTCSessionDescriptionInit }) => {
      events.onOffer?.({ userId, sdp });
    });

    socket.on('answer', ({ userId, sdp }: { userId: string; sdp: RTCSessionDescriptionInit }) => {
      events.onAnswer?.({ userId, sdp });
    });

    socket.on('ice-candidate', ({ userId, candidate }: { userId: string; candidate: RTCIceCandidateInit }) => {
      events.onIceCandidate?.({ userId, candidate });
    });

    socket.on('error', ({ code, message }: { code: string; message: string }) => {
      events.onError?.({ code, message });
    });

    socketRef.current = socket;
  }, [signalingUrl, events]);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
  }, []);

  const joinRoom = useCallback((roomId: string) => {
    socketRef.current?.emit('join-room', { roomId });
  }, []);

  const leaveRoom = useCallback((roomId: string) => {
    socketRef.current?.emit('leave-room', { roomId });
  }, []);

  const sendOffer = useCallback((targetUserId: string, sdp: RTCSessionDescriptionInit) => {
    socketRef.current?.emit('offer', { targetUserId, sdp });
  }, []);

  const sendAnswer = useCallback((targetUserId: string, sdp: RTCSessionDescriptionInit) => {
    socketRef.current?.emit('answer', { targetUserId, sdp });
  }, []);

  const sendIceCandidate = useCallback((targetUserId: string, candidate: RTCIceCandidateInit) => {
    socketRef.current?.emit('ice-candidate', { targetUserId, candidate });
  }, []);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  return {
    socket: socketRef.current,
    connect,
    disconnect,
    joinRoom,
    leaveRoom,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
  };
}
