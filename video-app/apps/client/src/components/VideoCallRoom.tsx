import { useState, useEffect, useRef, useCallback } from 'react';
import { ConnectionStatus, mediaConstraints, ClientError } from '../lib/webrtc-config';
import { useSignalingSocket, ChatMessage } from '../hooks/useSignalingSocket';
import { useMediasoup } from '../hooks/useMediasoup';
import { fetchChatHistory } from '../lib/api';
import { ConnectionBadge } from './ConnectionBadge';
import { ControlButton } from './ControlButton';
import { VideoTile } from './VideoTile';
import { ChatPanel } from './ChatPanel';
import {
  MicIcon,
  MicOffIcon,
  VideoOnIcon,
  VideoOffIcon,
  PhoneOffIcon,
  ChatIcon,
  ScreenShareIcon,
  ScreenShareOffIcon,
  SpinnerIcon,
  AlertIcon,
} from './icons';

const API_URL = import.meta.env.VITE_API_URL || '';

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
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const chatLoadedRef = useRef(false);
  const chatCursorRef = useRef('');
  const chatIdsRef = useRef<Set<string>>(new Set());

  const recordChatMessages = useCallback(
    (incoming: ChatMessage[], position: 'append' | 'prepend') => {
      setChatMessages((prev) => {
        const fresh = incoming.filter((m) => !chatIdsRef.current.has(m.id));
        fresh.forEach((m) => chatIdsRef.current.add(m.id));
        return position === 'prepend' ? [...fresh, ...prev] : [...prev, ...fresh];
      });
    },
    []
  );

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
      // Часть ошибок — функциональные (длина/rate limit чата, занятая демонстрация):
      // они не должны ронять весь звонок, достаточно тоста в углу.
      const fatal = ['ACCESS_DENIED', 'NOT_AUTHENTICATED', 'MEDIA_ERROR', 'NOT_IN_ROOM'].includes(code);
      setError(`${code}: ${message}`);
      if (fatal) setStatus('FAILED');
    },
    onChatMessage: (message) => {
      recordChatMessages([message], 'append');
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

  const loadChatHistory = useCallback(
    (cursor?: string) => {
      if (!token || chatBusy) return;
      setChatBusy(true);
      fetchChatHistory(API_URL, token, roomId, cursor)
        .then((page) => {
          // API отдаёт новые сообщения сверху — UI хочет старые сверху.
          const mapped: ChatMessage[] = (page.messages ?? [])
            .map((m) => ({
              id: m.id,
              userId: m.user_id,
              content: m.content,
              createdAt: m.created_at,
            }))
            .reverse();
          chatCursorRef.current = page.next_cursor ?? '';
          recordChatMessages(mapped, cursor ? 'prepend' : 'append');
        })
        .catch(() => {
          if (!cursor) {
            chatLoadedRef.current = false;
          }
        })
        .finally(() => setChatBusy(false));
    },
    [token, roomId, chatBusy, recordChatMessages]
  );

  const toggleChat = useCallback(() => {
    setChatOpen((prev) => {
      const next = !prev;
      if (next && !chatLoadedRef.current) {
        chatLoadedRef.current = true;
        loadChatHistory();
      }
      return next;
    });
  }, [loadChatHistory]);

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
  const screenParticipants = mediasoup.remoteParticipants.filter((p) => p.source === 'screen');
  const cameraParticipants = mediasoup.remoteParticipants.filter((p) => p.source === 'camera');
  const cameraCount = cameraParticipants.length;
  const hasContent = cameraCount > 0 || screenParticipants.length > 0;

  const handleScreenShareToggle = async () => {
    if (mediasoup.screenSharing) {
      mediasoup.stopScreenShare();
      return;
    }
    await mediasoup.startScreenShare();
  };

  return (
    <div className="flex h-full min-h-screen flex-col bg-bg">
      {/* шапка */}
      <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-text">{roomName || 'Комната'}</span>
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
            {roomId ? roomId.slice(0, 8) : ''}
          </span>
          {cameraCount > 0 && (
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-accent">
              {cameraCount} {cameraCount === 1 ? 'участник' : 'участника'}
            </span>
          )}
        </div>
        <ConnectionBadge status={status} />
      </header>

      {/* контент */}
      <main className="relative mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-3 pb-28 pt-2 sm:px-6">
        <div className="flex w-full flex-col items-center gap-3">
          {/* демонстрация экрана — крупно */}
          {(mediasoup.screenSharing && mediasoup.localScreenStream) || screenParticipants.length > 0 ? (
            <div className="flex w-full flex-col gap-3">
              {mediasoup.screenSharing && mediasoup.localScreenStream && (
                <VideoTile
                  stream={mediasoup.localScreenStream}
                  label="Ваш экран"
                  className="aspect-video w-full rounded-2xl border border-border bg-surface-2 shadow-2xl shadow-black/40 animate-fade-in"
                />
              )}
              {screenParticipants.map((participant) => (
                <VideoTile
                  key={`${participant.userId}-screen`}
                  stream={participant.stream}
                  label={`Экран ${participant.userId.slice(0, 8)}`}
                  className="aspect-video w-full rounded-2xl border border-border bg-surface-2 shadow-2xl shadow-black/40 animate-fade-in"
                />
              ))}
            </div>
          ) : null}

          {/* камеры — сеткой */}
          <div
            className={`grid w-full gap-3 ${
              cameraCount <= 1
                ? 'grid-cols-1'
                : cameraCount === 2
                  ? 'grid-cols-1 sm:grid-cols-2'
                  : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
            }`}
          >
            {cameraParticipants.map((participant) => (
              <VideoTile
                key={`${participant.userId}-camera`}
                stream={participant.stream}
                label={`Участник ${participant.userId.slice(0, 8)}`}
                className="aspect-[4/3] rounded-2xl border border-border shadow-2xl shadow-black/40 bg-surface-2 animate-fade-in"
                showPlaceholder={!participant.stream}
                placeholder="Соединение…"
              />
            ))}

            {/* заглушка ожидания */}
            {waiting && !hasContent && (
              <div className="flex aspect-[4/3] items-center justify-center rounded-2xl border border-border bg-surface-2 animate-fade-in">
                <div className="animate-pulse-soft flex items-center gap-2 rounded-full bg-black/50 px-4 py-1.5 text-sm text-white/90">
                  <SpinnerIcon className="h-4 w-4 text-accent" />
                  Ожидаем участников…
                </div>
              </div>
            )}
          </div>
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

      {/* панель чата */}
      {chatOpen && (
        <div className="fixed bottom-32 right-4 top-20 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-2xl">
          <ChatPanel
            messages={chatMessages}
            currentUserId={userId}
            onSend={(text) => signaling.sendChatMessage(text)}
            onLoadMore={() => {
              if (chatCursorRef.current) loadChatHistory(chatCursorRef.current);
            }}
            busy={chatBusy}
            onClose={() => setChatOpen(false)}
          />
        </div>
      )}

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
            <ControlButton
              label={mediasoup.screenSharing ? 'Остановить показ' : 'Экран'}
              active={mediasoup.screenSharing}
              onClick={handleScreenShareToggle}
            >
              {mediasoup.screenSharing ? <ScreenShareOffIcon /> : <ScreenShareIcon />}
            </ControlButton>
            <ControlButton label="Чат" active={chatOpen} onClick={toggleChat}>
              <ChatIcon />
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