import { ConnectionStatus } from '../lib/webrtc-config';

interface ConnectionStatusProps {
  status: ConnectionStatus;
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

export function ConnectionStatusIndicator({ status }: ConnectionStatusProps) {
  return (
    <div style={{ marginBottom: '10px' }}>
      Status: <strong>{statusLabels[status] || status}</strong>
    </div>
  );
}
