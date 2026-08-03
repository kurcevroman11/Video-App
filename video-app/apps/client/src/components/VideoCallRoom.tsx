import { useState, useEffect, useRef, useCallback } from 'react';
import { ConnectionStatus, mediaConstraints, ClientError, getIceServers } from '../lib/webrtc-config';
import { useSignalingSocket } from '../hooks/useSignalingSocket';
import { usePeerConnection } from '../hooks/usePeerConnection';
import { ConnectionBadge } from './ConnectionBadge';
import { ControlButton } from './ControlButton';
import { VideoTile } from './VideoTile';
import {
  MicIcon,
  MicOffIcon,
  VideoOnIcon,
  VideoOffIcon,
  PhoneOffIcon,
  SpinnerIcon,
  AlertIcon,
} from './icons';

interface VideoCallRoomProps {
  signalingUrl: string;
  apiUrl: string;
  token: string;
  userId: string;
  roomId: string;
  roomName?: string;
  onExit?: () => void;
}

async function acquireLocalMedia(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia(mediaConstraints);
  } catch (err: any) {
    if (err.name === 'NotAllowedError') {
      throw { code: 'PERMISSION_DENIED', message: 'Доступ к камере/микрофону отклонён' } as ClientError;
    }
    if (err.name === 'NotFoundError') {
      throw { code: 'NO_DEVICE', message: 'Камера или микрофон не найдены' } as ClientError;
    }
    if (err.name === 'NotReadableError') {
      throw { code: 'DEVICE_BUSY', message: 'Устройство уже используется другим приложением' } as ClientError;
    }
    throw { code: 'UNKNOWN_MEDIA_ERROR', message: err.message } as ClientError;
  }
}

const statusLabels: Record<ConnectionStatus, string> = {
  IDLE: 'Не подключено',
  CONNECTING_SIGNALING: 'Подключение к серверу...',
  WAITING_FOR_PEER: 'Ожидание собеседника...',
  NEGOTIATING: 'Установление соединения...',
  CONNECTED: 'Подключено',
  DISCONNECTED: 'Отключено',
  FAILED: 'Ошибка соединения',
  PERMISSION_DENIED: 'Доступ к камере/микрофону отклонён',
  NO_DEVICE: 'Камера или микрофон не найдены',
  DEVICE_BUSY: 'Устройство занято другим приложением',
};

export function VideoCallRoom({
  signalingUrl,
  apiUrl,
  token,
  userId,
  roomId,
  roomName,
  onExit,
}: VideoCallRoomProps) {
  const [status, setStatus] = useState<ConnectionStatus>('IDLE');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [iceServers, setIceServers] = useState<RTCIceServer[] | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteUserIdRef = useRef<string | null>(null);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const joinedRef = useRef(false);

  const signaling = useSignalingSocket(signalingUrl, {
    onRoomJoined: (participants) => {
      if (participants.length === 0) {
        setStatus('WAITING_FOR_PEER');
      } else {
        setRemoteUserId(participants[0].userId);
        setStatus('NEGOTIATING');
      }
    },
    onUserJoined: (userId) => {
      setRemoteUserId(userId);
      setStatus('NEGOTIATING');
    },
    onUserLeft: () => {
      setRemoteUserId(null);
      setStatus('DISCONNECTED');
      pendingCandidatesRef.current = [];
    },
    onError: ({ code, message }) => {
      setError(`${code}: ${message}`);
      setStatus('FAILED');
    },
  });

  const peerConnection = usePeerConnection(signaling.socket || null, remoteUserId, iceServers);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && peerConnection.remoteStream) {
      remoteVideoRef.current.srcObject = peerConnection.remoteStream;
    }
  }, [peerConnection.remoteStream]);

  useEffect(() => {
    if (peerConnection.connectionState === 'connected') {
      setStatus('CONNECTED');
    } else if (peerConnection.connectionState === 'failed') {
      setStatus('FAILED');
    }
  }, [peerConnection.connectionState]);

  const joinRoom = useCallback(async () => {
    setError(null);
    setStatus('CONNECTING_SIGNALING');

    try {
      const stream = await acquireLocalMedia();
      setLocalStream(stream);

      const servers = await getIceServers(apiUrl, token);
      setIceServers(servers);
    } catch (err) {
      const clientError = err as ClientError;
      setError(clientError.message || 'Не удалось получить ICE-серверы');
      setStatus(
        clientError.code && clientError.code in statusLabels
          ? (clientError.code as ConnectionStatus)
          : 'FAILED'
      );
      return;
    }

    signaling.connect(token);
    signaling.joinRoom(roomId);
  }, [signaling, token, roomId, apiUrl]);

  // автоматический вход при монтировании экрана звонка
  useEffect(() => {
    if (joinedRef.current) return;
    joinedRef.current = true;
    joinRoom();
  }, [joinRoom]);

  // Единственная точка создания и отправки любого SDP (offer ИЛИ answer).
  // setLocalDescription() без аргументов: браузер сам выбирает роль (offer/answer) по текущему состоянию.
  const startNegotiation = useCallback(async () => {
    const pc = peerConnection.pcRef.current;
    const target = remoteUserIdRef.current;
    if (!pc || !target || makingOfferRef.current) return;

    try {
      makingOfferRef.current = true;
      await pc.setLocalDescription();
      const desc = pc.localDescription;
      if (desc) {
        if (desc.type === 'offer') signaling.sendOffer(target, desc);
        else signaling.sendAnswer(target, desc);
      }
    } catch (err: any) {
      setError(`Negotiation failed: ${err.message}`);
    } finally {
      makingOfferRef.current = false;
    }
  }, [signaling, peerConnection.pcRef]);

  useEffect(() => {
    remoteUserIdRef.current = remoteUserId;
  }, [remoteUserId]);

  // настройка единого драйвера переговоров
  useEffect(() => {
    const pc = peerConnection.pcRef.current;
    if (!pc) return;
    pc.onnegotiationneeded = startNegotiation;
  }, [peerConnection.pcRef, startNegotiation]);

  // добавление медиатреков один раз (addTrack сам инициирует negotiationneeded)
  useEffect(() => {
    const pc = peerConnection.pcRef.current;
    if (!pc || !localStream) return;
    const hasVideoTrack = pc.getSenders().some(s => s.track?.kind === 'video');
    if (!hasVideoTrack) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }
  }, [peerConnection.pcRef, localStream]);

  // когда появляется пир — запустить переговоры, если ещё не запущены
  useEffect(() => {
    const pc = peerConnection.pcRef.current;
    if (!pc || status !== 'NEGOTIATING' || !remoteUserId) return;
    if (pc.signalingState === 'stable' && !pc.localDescription) {
      startNegotiation();
    }
  }, [status, remoteUserId, peerConnection.pcRef, startNegotiation]);

  // обработчики сигнального канала (perfect negotiation: polite/impolite)
  useEffect(() => {
    if (!signaling.socket) return;
    const socket = signaling.socket;

    socket.on('offer', async ({ userId: senderId, sdp }: { userId: string; sdp: RTCSessionDescriptionInit }) => {
      setRemoteUserId(senderId);
      remoteUserIdRef.current = senderId;
      setStatus('NEGOTIATING');

      const pc = peerConnection.pcRef.current;
      if (!pc) return;

      try {
        const senders = pc.getSenders();
        const hasVideoTrack = senders.some(s => s.track?.kind === 'video');
        if (!hasVideoTrack && localStream) {
          localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        }

        const polite = userId > senderId;
        const offerCollision = sdp.type === 'offer' &&
          (makingOfferRef.current || pc.signalingState !== 'stable');
        ignoreOfferRef.current = !polite && offerCollision;
        if (ignoreOfferRef.current) {
          console.log('Ignoring colliding offer (impolite peer)');
          return;
        }

        await pc.setRemoteDescription(sdp);
        for (const c of pendingCandidatesRef.current) {
          await pc.addIceCandidate(c);
        }
        pendingCandidatesRef.current = [];

        if (sdp.type === 'offer') {
          await startNegotiation();
        }
      } catch (err: any) {
        setError(`Offer handling error: ${err.message}`);
      }
    });

    socket.on('answer', async ({ sdp }: { userId: string; sdp: RTCSessionDescriptionInit }) => {
      const pc = peerConnection.pcRef.current;
      if (!pc) return;

      try {
        await pc.setRemoteDescription(sdp);
        for (const c of pendingCandidatesRef.current) {
          await pc.addIceCandidate(c);
        }
        pendingCandidatesRef.current = [];
      } catch (err: any) {
        setError(`Answer handling error: ${err.message}`);
      }
    });

    socket.on('ice-candidate', async ({ candidate }: { userId: string; candidate: RTCIceCandidateInit }) => {
      const pc = peerConnection.pcRef.current;
      if (!pc) return;

      try {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(candidate);
        } else {
          pendingCandidatesRef.current.push(candidate);
        }
      } catch (err: any) {
        if (!ignoreOfferRef.current) {
          setError(`ICE candidate error: ${err.message}`);
        }
      }
    });

    return () => {
      socket.off('offer');
      socket.off('answer');
      socket.off('ice-candidate');
    };
  }, [signaling.socket, peerConnection.pcRef, signaling, localStream, startNegotiation, userId]);

  useEffect(() => {
    return () => {
      localStream?.getTracks().forEach(track => track.stop());
      peerConnection.close();
      signaling.disconnect();
    };
  }, []);

  const handleLeave = () => {
    localStream?.getTracks().forEach(track => track.stop());
    peerConnection.close();
    signaling.disconnect();
    setLocalStream(null);
    setRemoteUserId(null);
    remoteUserIdRef.current = null;
    setStatus('IDLE');
    pendingCandidatesRef.current = [];
    onExit?.();
  };

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    localStream?.getAudioTracks().forEach(t => {
      t.enabled = next;
    });
  };

  const toggleCam = () => {
    const next = !camOn;
    setCamOn(next);
    localStream?.getVideoTracks().forEach(t => {
      t.enabled = next;
    });
  };

  const waiting = status === 'WAITING_FOR_PEER' || (status === 'CONNECTING_SIGNALING' && !peerConnection.remoteStream);
  const ended = status === 'DISCONNECTED' || status === 'FAILED';

  return (
    <div className="flex h-full min-h-screen flex-col bg-bg">
      {/* шапка */}
      <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-text">{roomName || 'Комната'}</span>
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
            {roomId ? roomId.slice(0, 8) : ''}
          </span>
        </div>
        <ConnectionBadge status={status} />
      </header>

      {/* контент */}
      <main className="relative mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-3 pb-28 pt-2 sm:px-6">
        <div className="relative aspect-[4/3] w-full max-h-full overflow-hidden rounded-2xl border border-border shadow-2xl shadow-black/40 bg-surface-2 animate-fade-in">
          {/* удалённое видео */}
          <VideoTile
            stream={peerConnection.remoteStream}
            label={remoteUserId ? `Собеседник` : undefined}
            className="absolute inset-0"
            showPlaceholder={waiting || !peerConnection.remoteStream}
            placeholder={waiting ? 'Ожидаем собеседника…' : 'Соединение…'}
          />

          {/* заглушка ожидания */}
          {waiting && (
            <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2">
              <div className="animate-pulse-soft flex items-center gap-2 rounded-full bg-black/50 px-4 py-1.5 text-sm text-white/90">
                <SpinnerIcon className="h-4 w-4 text-accent" />
                Ожидаем собеседника…
              </div>
            </div>
          )}

          {/* локальный PiP */}
          <VideoTile
            stream={localStream}
            mirror
            label="Вы"
            className="absolute right-3 top-3 aspect-[3/4] w-28 rounded-xl border border-white/20 shadow-xl shadow-black/50 sm:w-36"
            showPlaceholder={!localStream}
            placeholder="Камера выключена"
          />
        </div>
      </main>

      {/* панель управления */}
      {!ended && (
        <footer className="flex justify-center px-4 pb-6 pt-2">
          <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-surface/80 px-5 py-3 backdrop-blur sm:gap-6">
            <ControlButton label={micOn ? 'Микрофон' : 'Без звука'} active={micOn} onClick={toggleMic}>
              {micOn ? <MicIcon /> : <MicOffIcon />}
            </ControlButton>
            <ControlButton label={camOn ? 'Камера' : 'Камера выкл'} active={camOn} onClick={toggleCam}>
              {camOn ? <VideoOnIcon /> : <VideoOffIcon />}
            </ControlButton>
            <div className="mx-1 h-10 w-px bg-white/10" />
            <ControlButton label="Завершить" danger onClick={handleLeave}>
              <PhoneOffIcon />
            </ControlButton>
          </div>
        </footer>
      )}

      {/* ошибка устройства / медиа */}
      {error && !ended && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 px-4">
          <div className="animate-float-in flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertIcon className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        </div>
      )}

      {/* экран разрыва / ошибки */}
      {ended && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="animate-float-in w-full max-w-sm rounded-2xl border border-white/10 bg-surface p-8 text-center shadow-2xl">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-danger/15 text-danger">
              <PhoneOffIcon />
            </div>
            <h2 className="text-xl font-semibold text-white">
              {status === 'DISCONNECTED' ? 'Собеседник отключился' : 'Ошибка соединения'}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {status === 'DISCONNECTED'
                ? 'Звонок завершён. Вы можете переподключиться или выйти в начало.'
                : error || 'Не удалось установить соединение. Попробуйте ещё раз.'}
            </p>

            {status === 'FAILED' && (error ?? '').includes('PERMISSION_DENIED') === false && error && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-white/5 bg-surface-2 p-3 text-left text-xs text-muted">
                <AlertIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted" />
                <span>{error}</span>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  joinedRef.current = false;
                  joinRoom();
                }}
                className="flex-1 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                Переподключиться
              </button>
              <button
                type="button"
                onClick={() => onExit?.()}
                className="flex-1 rounded-xl border border-white/10 px-5 py-3 text-sm font-medium text-muted transition hover:bg-white/5 hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
              >
                В начало
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}