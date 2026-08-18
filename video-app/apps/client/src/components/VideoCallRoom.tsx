import { useState, useEffect, useRef, useCallback } from 'react';
import { ConnectionStatus, mediaConstraints, ClientError } from '../lib/webrtc-config';
import { useSignalingSocket } from '../hooks/useSignalingSocket';
import { useMediasoup } from '../hooks/useMediasoup';
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
  WAITING_FOR_PEER: 'Ожидание участников...',
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
  token,
  userId,
  roomId,
  roomName,
  onExit,
}: VideoCallRoomProps) {
  const [status, setStatus] = useState<ConnectionStatus>('IDLE');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const joinedRef = useRef(false);

  const signaling = useSignalingSocket(signalingUrl, {
    onRoomJoined: ({ participants }) => {
      // participants — только другие участники (свой сокет исключён из списка).
      if (participants.length === 0) {
        setStatus('WAITING_FOR_PEER');
      } else {
        setStatus('NEGOTIATING');
      }
    },
    onUserJoined: () => {
      // Кто-то вошёл — идёт установка соединения (SFU-сценарий п.6).
      setStatus('NEGOTIATING');
    },
    onError: ({ code, message }) => {
      setError(`${code}: ${message}`);
      setStatus('FAILED');
    },
    onDisconnect: () => {
      setStatus('CONNECTING_SIGNALING');
    },
    onReconnect: () => {
      signaling.joinRoom(roomId);
    },
  });

  const mediasoup = useMediasoup(signaling.socket, signaling, roomId, userId, localStream);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (mediasoup.connectionState === 'connected' && mediasoup.remoteParticipants.length > 0) {
      setStatus('CONNECTED');
    }
  }, [mediasoup.connectionState, mediasoup.remoteParticipants.length]);

  const joinRoom = useCallback(async () => {
    setError(null);
    setStatus('CONNECTING_SIGNALING');

    try {
      const stream = await acquireLocalMedia();
      setLocalStream(stream);
    } catch (err) {
      const clientError = err as ClientError;
      setError(clientError.message || 'Не удалось получить доступ к камере');
      setStatus(
        clientError.code && clientError.code in statusLabels
          ? (clientError.code as ConnectionStatus)
          : 'FAILED'
      );
      return;
    }

    signaling.connect(token);
    signaling.joinRoom(roomId);
  }, [signaling, token, roomId]);

  // обновить токен сокета при ротации (тихий refresh в App)
  useEffect(() => {
    signaling.updateToken(token);
  }, [token, signaling]);

  // автоматический вход при монтировании экрана звонка
  useEffect(() => {
    if (joinedRef.current) return;
    joinedRef.current = true;
    joinRoom();
  }, [joinRoom]);

  const resetStates = useCallback(() => {
    mediasoup.close();
    localStream?.getTracks().forEach(track => track.stop());
    setLocalStream(null);
    setStatus('IDLE');
  }, [mediasoup, localStream]);

  useEffect(() => {
    return () => {
      resetStates();
      signaling.disconnect();
    };
  }, []);

  const handleLeave = () => {
    signaling.leaveRoom(roomId);
    resetStates();
    signaling.disconnect();
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

  const waiting = status === 'WAITING_FOR_PEER' || (status === 'CONNECTING_SIGNALING' && mediasoup.remoteParticipants.length === 0);
  const ended = status === 'DISCONNECTED' || status === 'FAILED';
  const participantCount = mediasoup.remoteParticipants.length;

  return (
    <div className="flex h-full min-h-screen flex-col bg-bg">
      {/* шапка */}
      <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-text">{roomName || 'Комната'}</span>
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
            {roomId ? roomId.slice(0, 8) : ''}
          </span>
          {participantCount > 0 && (
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-accent">
              {participantCount} {participantCount === 1 ? 'участник' : 'участника'}
            </span>
          )}
        </div>
        <ConnectionBadge status={status} />
      </header>

      {/* контент */}
      <main className="relative mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-3 pb-28 pt-2 sm:px-6">
        <div
          className={`grid w-full gap-3 ${
            participantCount <= 1
              ? 'grid-cols-1'
              : participantCount === 2
                ? 'grid-cols-1 sm:grid-cols-2'
                : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
          }`}
        >
          {/* удалённые участники */}
          {mediasoup.remoteParticipants.map((participant) => (
            <VideoTile
              key={participant.userId}
              stream={participant.stream}
              label={`Участник ${participant.userId.slice(0, 8)}`}
              className="aspect-[4/3] rounded-2xl border border-border shadow-2xl shadow-black/40 bg-surface-2 animate-fade-in"
              showPlaceholder={!participant.stream}
              placeholder="Соединение…"
            />
          ))}

          {/* заглушка ожидания */}
          {waiting && mediatorRemoteEmpty(mediasoup) && (
            <div className="flex aspect-[4/3] items-center justify-center rounded-2xl border border-border bg-surface-2 animate-fade-in">
              <div className="animate-pulse-soft flex items-center gap-2 rounded-full bg-black/50 px-4 py-1.5 text-sm text-white/90">
                <SpinnerIcon className="h-4 w-4 text-accent" />
                Ожидаем участников…
              </div>
            </div>
          )}
        </div>

        {/* локальный PiP */}
        <div className="pointer-events-none absolute right-3 top-3 z-10 w-28 sm:w-36">
          <VideoTile
            stream={localStream}
            mirror
            label="Вы"
            className="aspect-[3/4] rounded-xl border border-white/20 shadow-xl shadow-black/50"
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
              {status === 'DISCONNECTED' ? 'Соединение прервано' : 'Ошибка соединения'}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {status === 'DISCONNECTED'
                ? 'Сервер сигналинга отключился. Вы можете переподключиться или выйти в начало.'
                : error || 'Не удалось установить соединение. Попробуйте ещё раз.'}
            </p>

            {status === 'FAILED' && error && (
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

function mediatorRemoteEmpty(mediasoup: { remoteParticipants: { userId: string; stream: MediaStream }[] }): boolean {
  return mediasoup.remoteParticipants.length === 0;
}