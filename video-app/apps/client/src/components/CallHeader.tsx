import { ConnectionStatus } from '../lib/webrtc-config';
import { useIsMobile } from '../hooks/useMediaQuery';
import { ConnectionIndicator } from './ConnectionIndicator';
import { ArrowBackIcon } from './icons';

interface CallHeaderProps {
  roomName?: string;
  roomId: string;
  status: ConnectionStatus;
  visible: boolean;
  onBack?: () => void;
}

export function CallHeader({ roomName, roomId, status, visible, onBack }: CallHeaderProps) {
  const isMobile = useIsMobile();
  const short = roomId ? roomId.slice(0, 8) : '—';

  return (
    <header
      className={`pointer-events-none absolute inset-x-0 top-0 z-30 transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      aria-hidden={!visible}
    >
      <div className="pointer-events-auto mx-auto flex w-full max-w-screen-2xl items-center justify-between gap-3 px-3 pb-2 pt-3 pl-safe pr-safe pt-safe sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          {isMobile && onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Назад"
              title="Назад"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur transition hover:bg-black/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <ArrowBackIcon className="h-5 w-5" />
            </button>
          )}
          <div className="flex min-w-0 items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur">
            <span className="truncate text-sm font-semibold text-white">
              {roomName || 'Комната'}
            </span>
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/70">
              {short}
            </span>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur">
          <ConnectionIndicator status={status} size="sm" />
          {!isMobile && (
            <span className="text-xs font-medium text-white/80">
              {statusLabel(status)}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

function statusLabel(status: ConnectionStatus): string {
  switch (status) {
    case 'IDLE':
      return 'Готово';
    case 'CONNECTING_SIGNALING':
      return 'Подключение…';
    case 'WAITING_FOR_PEER':
      return 'Ожидаем…';
    case 'NEGOTIATING':
      return 'Соединение…';
    case 'CONNECTED':
      return 'Подключено';
    case 'DISCONNECTED':
      return 'Отключено';
    case 'FAILED':
      return 'Ошибка';
    case 'PERMISSION_DENIED':
      return 'Нет доступа';
    case 'NO_DEVICE':
      return 'Нет устройства';
    case 'DEVICE_BUSY':
      return 'Устройство занято';
    default:
      return '';
  }
}
