import { ConnectionStatus } from '../lib/webrtc-config';

interface ConnectionIndicatorProps {
  status: ConnectionStatus;
  size?: 'sm' | 'md';
}

const STATUS_CONFIG: Record<
  ConnectionStatus,
  { color: string; label: string; pulse: boolean }
> = {
  IDLE: { color: 'var(--color-muted)', label: 'Не подключено', pulse: false },
  CONNECTING_SIGNALING: { color: 'var(--color-accent)', label: 'Подключение к серверу', pulse: true },
  WAITING_FOR_PEER: { color: 'var(--color-accent)', label: 'Ожидание участников', pulse: true },
  NEGOTIATING: { color: 'var(--color-accent)', label: 'Установление соединения', pulse: true },
  CONNECTED: { color: '#2ec283', label: 'Подключено', pulse: false },
  DISCONNECTED: { color: 'var(--color-danger)', label: 'Соединение потеряно', pulse: false },
  FAILED: { color: 'var(--color-danger)', label: 'Ошибка соединения', pulse: false },
  PERMISSION_DENIED: { color: 'var(--color-danger)', label: 'Нет доступа к камере/микрофону', pulse: false },
  NO_DEVICE: { color: 'var(--color-danger)', label: 'Камера/микрофон не найдены', pulse: false },
  DEVICE_BUSY: { color: 'var(--color-danger)', label: 'Устройство занято', pulse: false },
};

export function ConnectionIndicator({ status, size = 'md' }: ConnectionIndicatorProps) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.IDLE;
  const dim = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';
  return (
    <span
      role="status"
      aria-label={cfg.label}
      title={cfg.label}
      className="relative inline-flex items-center"
    >
      <span
        className={`${dim} rounded-full ${cfg.pulse ? 'animate-pulse-soft' : ''}`}
        style={{ background: cfg.color }}
      />
    </span>
  );
}
