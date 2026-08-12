import { useRef, useEffect, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';

export interface UsePeerConnectionReturn {
  pcRef: React.RefObject<RTCPeerConnection | null>;
  pc: RTCPeerConnection | null;
  connectionState: RTCPeerConnectionState;
  remoteStream: MediaStream | null;
  addIceCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
  createOffer: () => Promise<RTCSessionDescriptionInit>;
  setLocalDescription: (sdp: RTCSessionDescriptionInit) => Promise<void>;
  setRemoteDescription: (sdp: RTCSessionDescriptionInit) => Promise<void>;
  close: () => void;
}

const LOG_TAG = '[rtc]';

function candidateInfo(candidate: RTCIceCandidate | RTCIceCandidateInit | null): string {
  if (!candidate) return 'end-of-candidates';
  const c = candidate as RTCIceCandidate;
  const parts = c.candidate ? c.candidate.split(' ') : [];
  const type = parts[0] || '?';
  const port = c.port ?? parts[5] ?? '?';
  return `${type}:${c.protocol ?? '?'}:${c.type ?? '?'}@${c.address ?? '?'}:${port}`;
}

export function usePeerConnection(
  socket: Socket | null,
  remoteUserId: string | null,
  iceServers: RTCIceServer[] | null
): UsePeerConnectionReturn {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const [pc, setPc] = useState<RTCPeerConnection | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (!socket || !remoteUserId || !iceServers) return;

    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;
    setPc(pc);
    setConnectionState('new');
    setRemoteStream(null);

    console.log(LOG_TAG, `create PC remote=${remoteUserId} iceServers=`, iceServers.map(s => ({
      urls: s.urls,
      username: s.username ? s.username.split(':')[0] + ':...' : undefined,
      hasCredential: !!s.credential,
    })));

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState);
      console.log(LOG_TAG, `connectionState=${pc.connectionState}`);
      if (pc.connectionState === 'connected') {
        pc.getStats().then((stats) => {
          stats.forEach((report) => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              const local = stats.get(report.localCandidateId);
              const remote = stats.get(report.remoteCandidateId);
              console.log(LOG_TAG, `ACTIVE PAIR local=${local?.candidateType ?? '?'}:${local?.ip ?? '?'} remote=${remote?.candidateType ?? '?'}:${remote?.ip ?? '?'} via=${report.nominated ? 'nominated' : 'not-nominated'}`);
            }
          });
        });
      }
      if (pc.connectionState === 'failed') {
        pc.getStats().then((stats) => {
          stats.forEach((report) => {
            if (report.type === 'candidate-pair') {
              console.log(LOG_TAG, `pair state=${report.state} local=${report.localCandidateId} remote=${report.remoteCandidateId}`);
            }
          });
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(LOG_TAG, `iceConnectionState=${pc.iceConnectionState}`);
    };

    pc.onsignalingstatechange = () => {
      console.log(LOG_TAG, `signalingState=${pc.signalingState}`);
    };

    pc.ontrack = (event) => {
      console.log(LOG_TAG, `onTrack kind=${event.track.kind} streamId=${(event.streams[0]?.id) ?? '?'}`);
      setRemoteStream(event.streams[0] || null);
    };

    pc.onicecandidate = (event) => {
      console.log(LOG_TAG, `local candidate: ${candidateInfo(event.candidate)}`);
      if (event.candidate) {
        socket.emit('ice-candidate', {
          targetUserId: remoteUserId,
          candidate: event.candidate,
        });
      }
    };

    pc.onicecandidateerror = (event) => {
      const e = event as RTCPeerConnectionIceErrorEvent & { url?: string; address?: string; port?: number };
      console.error(LOG_TAG, `icecandidateerror code=${e.errorCode} ${e.errorText} url=${e.url ?? '?'} address=${e.address ?? '?'}:${e.port ?? '?'}`);
    };

    return () => {
      pcRef.current?.close();
      pcRef.current = null;
      setPc(null);
      pendingCandidatesRef.current = [];
    };
  }, [socket, remoteUserId, iceServers]);

  const addIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const pc = pcRef.current;
    if (!pc) return;

    if (pc.remoteDescription) {
      console.log(LOG_TAG, `added remote candidate: ${candidateInfo(candidate)}`);
      await pc.addIceCandidate(candidate);
    } else {
      console.log(LOG_TAG, `queued remote candidate (no remote desc yet): ${candidateInfo(candidate)}`);
      pendingCandidatesRef.current.push(candidate);
    }
  }, []);

  const flushPendingCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;

    if (pendingCandidatesRef.current.length > 0) {
      console.log(LOG_TAG, `flushing ${pendingCandidatesRef.current.length} queued remote candidates`);
    }
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
    pc,
    connectionState,
    remoteStream,
    addIceCandidate,
    createOffer,
    setLocalDescription,
    setRemoteDescription,
    close,
  };
}
