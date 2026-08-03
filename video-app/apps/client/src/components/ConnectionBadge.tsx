import { ConnectionStatus } from '../lib/webrtc-config';
import { SpinnerIcon } from './icons';

interface ConnectionBadgeProps {
  status: ConnectionStatus;
}

const config: Record<
  ConnectionStatus,
  { label: string; dot: string; text: string; spinner?: boolean }
> = {
  IDLE: { label: 'Готово', dot: 'var(--color-muted)', text: 'text-muted' },
  CONNECTING_SIGNALING: { label: 'Подключение…', dot: 'var(--color-accent)', text: 'text-accent', spinner: true },
  WAITING_FOR_PEER: { label: 'Ожидаем собеседника…', dot: 'var(--color-accent)', text: 'text-accent', spinner: true },
  NEGOTIATING: { label: 'Установление соединения…', dot: 'var(--color-accent)', text: 'text-accent', spinner: true },
  CONNECTED: { label: 'Подключено', dot: '#2ec283', text: 'text-[#2ec283]' },
  DISCONNECTED: { label: 'Соединение потеряно', dot: 'var(--color-danger)', text: 'text-danger' },
  FAILED: { label: 'Ошибка соединения', dot: 'var(--color-danger)', text: 'text-danger' },
  PERMISSION_DENIED: { label: 'Нет доступа к камере/микрофону', dot: 'var(--color-danger)', text: 'text-danger' },
  NO_DEVICE: { label: 'Камера/микрофон не найдены', dot: 'var(--color-danger)', text: 'text-danger' },
  DEVICE_BUSY: { label: 'Устройство занято', dot: 'var(--color-danger)', text: 'text-danger' },
};

export function ConnectionBadge({ status }: ConnectionBadgeProps) {
  const c = config[status] ?? config.IDLE;

  return (
    <div
      className={`animate-fade-in inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs font-medium backdrop-blur ${c.text}`}
    >
      {c.spinner ? (
        <SpinnerIcon className="h-3.5 w-3.5" />
      ) : (
        <span className="h-2 w-2 rounded-full" style={{ background: c.dot }} />
      )}
      {c.label}
    </div>
  );
}