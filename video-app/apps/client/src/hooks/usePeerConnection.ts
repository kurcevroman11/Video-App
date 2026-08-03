import { useRef, useEffect, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';

export interface UsePeerConnectionReturn {
  pcRef: React.RefObject<RTCPeerConnection | null>;
  connectionState: RTCPeerConnectionState;
  remoteStream: MediaStream | null;
  addIceCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
  createOffer: () => Promise<RTCSessionDescriptionInit>;
  setLocalDescription: (sdp: RTCSessionDescriptionInit) => Promise<void>;
  setRemoteDescription: (sdp: RTCSessionDescriptionInit) => Promise<void>;
  close: () => void;
}

export function usePeerConnection(
  socket: Socket | null,
  remoteUserId: string | null,
  iceServers: RTCIceServer[] | null
): UsePeerConnectionReturn {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (!socket || !remoteUserId || !iceServers) return;

    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState);
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0] || null);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', {
          targetUserId: remoteUserId,
          candidate: event.candidate,
        });
      }
    };

    return () => {
      pcRef.current?.close();
      pcRef.current = null;
      pendingCandidatesRef.current = [];
    };
  }, [socket, remoteUserId, iceServers]);

  const addIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const pc = pcRef.current;
    if (!pc) return;

    if (pc.remoteDescription) {
      await pc.addIceCandidate(candidate);
    } else {
      pendingCandidatesRef.current.push(candidate);
    }
  }, []);

  const flushPendingCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;

    for (const candidate of pendingCandidatesRef.current) {
      await pc.addIceCandidate(candidate);
    }
    pendingCandidatesRef.current = [];
  }, []);

  const createOffer = useCallback(async (): Promise<RTCSessionDescriptionInit> => {
    const pc = pcRef.current;
    if (!pc) throw new Error('PeerConnection not initialized');
    return pc.createOffer();
  }, []);

  const setLocalDescription = useCallback(async (sdp: RTCSessionDescriptionInit) => {
    const pc = pcRef.current;
    if (!pc) throw new Error('PeerConnection not initialized');
    await pc.setLocalDescription(sdp);
  }, []);

  const setRemoteDescription = useCallback(async (sdp: RTCSessionDescriptionInit) => {
    const pc = pcRef.current;
    if (!pc) throw new Error('PeerConnection not initialized');
    await pc.setRemoteDescription(sdp);
    await flushPendingCandidates();
  }, [flushPendingCandidates]);

  const close = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
  }, []);

  return {
    pcRef,
    connectionState,
    remoteStream,
    addIceCandidate,
    createOffer,
    setLocalDescription,
    setRemoteDescription,
    close,
  };
}
