import { useEffect, useRef, useState } from 'react';
import { mediaConstraints } from '../lib/webrtc-config';
import { ControlButton } from './ControlButton';
import { MicIcon, MicOffIcon, VideoOnIcon, VideoOffIcon, AlertIcon, SpinnerIcon, ArrowBackIcon } from './icons';

interface JoinScreenProps {
  initialRoomId: string;
  roomName?: string;
  onJoin: (roomId: string) => void;
  onBack: () => void;
}

interface PreviewError {
  title: string;
  hint: string;
}

function mapPreviewError(err: unknown): PreviewError {
  const name = (err as any)?.name;
  if (name === 'NotAllowedError') {
    return {
      title: 'Нет доступа к камере или микрофону',
      hint: 'Разрешите доступ в настройках браузера (значок камеры в адресной строке), затем нажмите «Повторить».',
    };
  }
  if (name === 'NotFoundError') {
    return {
      title: 'Камера или микрофон не найдены',
      hint: 'Проверьте, что устройства подключены и включены.',
    };
  }
  if (name === 'NotReadableError') {
    return {
      title: 'Устройство занято другим приложением',
      hint: 'Закройте приложения, использующие камеру или микрофон (браузер, мессенджер), и повторите.',
    };
  }
  return {
    title: 'Не удалось получить доступ к устройствам',
    hint: 'Попробуйте ещё раз или проверьте настройки браузера.',
  };
}

export function JoinScreen({ initialRoomId, roomName, onJoin, onBack }: JoinScreenProps) {
  const [roomId] = useState(initialRoomId);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<PreviewError | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const startPreview = async () => {
    setLoading(true);
    setError(null);
    setStream((prev) => {
      prev?.getTracks().forEach((t) => t.stop());
      return null;
    });
    try {
      const s = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      setStream(s);
    } catch (err) {
      setError(mapPreviewError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    startPreview();
    return () => {
      setStream((prev) => {
        prev?.getTracks().forEach((t) => t.stop());
        return null;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    stream?.getAudioTracks().forEach((t) => {
      t.enabled = next;
    });
  };

  const toggleCam = () => {
    const next = !camOn;
    setCamOn(next);
    stream?.getVideoTracks().forEach((t) => {
      t.enabled = next;
    });
  };

  const canJoin = roomId.trim().length > 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-text"
        >
          <ArrowBackIcon className="h-4 w-4" />
          Назад к комнатам
        </button>

        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40 animate-float-in">
          {/* превью камеры */}
          <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-2">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`h-full w-full -scale-x-100 object-cover transition-opacity ${
                stream && camOn ? 'opacity-100' : 'opacity-0'
              }`}
            />

            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-2 text-muted">
                <SpinnerIcon className="h-8 w-8 text-accent" />
                <span className="text-sm">Проверяем камеру…</span>
              </div>
            )}

            {!loading && (!stream || !camOn) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-2">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-muted">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20a8 8 0 0 1 16 0" />
                  </svg>
                </div>
                <p className="px-6 text-center text-sm text-muted">
                  {error ? 'Камера недоступна' : 'Камера выключена'}
                </p>
              </div>
            )}

            {/* имя комнаты */}
            <div className="pointer-events-none absolute left-3 top-3">
              <span className="rounded-md bg-black/50 px-2 py-1 text-xs font-medium text-white/90">
                {roomName || 'Комната'} {roomId ? `· ${roomId.slice(0, 8)}` : ''}
              </span>
            </div>
          </div>

          {/* панель настроек перед входом */}
          <div className="flex items-center justify-center gap-4 border-b border-white/5 px-4 py-4">
            <ControlButton label={micOn ? 'Микрофон' : 'Без звука'} active={micOn} onClick={toggleMic}>
              {micOn ? <MicIcon /> : <MicOffIcon />}
            </ControlButton>
            <ControlButton label={camOn ? 'Камера' : 'Камера выкл'} active={camOn} onClick={toggleCam}>
              {camOn ? <VideoOnIcon /> : <VideoOffIcon />}
            </ControlButton>
          </div>

          {/* ошибка доступа */}
          {error && (
            <div className="mx-4 mt-4 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-3">
              <AlertIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-danger" />
              <div>
                <p className="text-sm font-medium text-danger">{error.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{error.hint}</p>
                <button
                  type="button"
                  onClick={startPreview}
                  className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-text transition hover:bg-white/15"
                >
                  Повторить
                </button>
              </div>
            </div>
          )}

          {/* вход в комнату */}
          <div className="space-y-3 p-4">
            <label className="block text-xs font-medium uppercase tracking-wide text-muted">
              Код комнаты
            </label>
            <input
              type="text"
              value={roomId}
              readOnly
              onFocus={(e) => {
                e.target.select();
                navigator.clipboard
                  ?.writeText(roomId)
                  .catch(() => undefined);
              }}
              placeholder="Например, a1b2c3"
              className="w-full cursor-default select-all rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text placeholder:text-muted/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
            <button
              type="button"
              disabled={!canJoin}
              onClick={() => onJoin(roomId.trim())}
              className="w-full rounded-xl bg-accent px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Войти в комнату
            </button>
            <p className="text-center text-xs text-muted/70">
              Перед входом вы видите собственное видео и можете проверить камеру и микрофон.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}