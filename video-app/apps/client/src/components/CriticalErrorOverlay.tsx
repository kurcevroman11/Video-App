import { ConnectionStatus } from '../lib/webrtc-config';
import { PhoneOffIcon, AlertIcon } from './icons';

interface CriticalErrorOverlayProps {
  status: ConnectionStatus;
  error: string | null;
  onReconnect: () => void;
  onExit: () => void;
}

export function CriticalErrorOverlay({
  status,
  error,
  onReconnect,
  onExit,
}: CriticalErrorOverlayProps) {
  const isDisconnected = status === 'DISCONNECTED';
  const title = isDisconnected ? 'Соединение прервано' : 'Ошибка соединения';
  const description = isDisconnected
    ? 'Сервер сигналинга отключился. Можно переподключиться или выйти.'
    : error || 'Не удалось установить соединение. Попробуйте ещё раз.';

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="animate-float-in w-full max-w-sm rounded-2xl border border-white/10 bg-surface p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger/15 text-danger">
          {isDisconnected ? <PhoneOffIcon className="h-7 w-7" /> : <AlertIcon className="h-7 w-7" />}
        </div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="mt-1.5 text-sm text-muted">{description}</p>

        {error && !isDisconnected && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-white/5 bg-surface-2 p-3 text-left text-xs text-muted">
            <AlertIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onReconnect}
            className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            Переподключиться
          </button>
          <button
            type="button"
            onClick={onExit}
            className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-muted transition hover:bg-white/5 hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            В начало
          </button>
        </div>
      </div>
    </div>
  );
}
