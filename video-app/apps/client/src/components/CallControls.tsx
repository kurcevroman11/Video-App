import { ControlButton } from './ControlButton';
import {
  MicIcon,
  MicOffIcon,
  VideoOnIcon,
  VideoOffIcon,
  PhoneOffIcon,
  ChatIcon,
  ScreenShareIcon,
  ScreenShareOffIcon,
} from './icons';
import { useIsMobile } from '../hooks/useMediaQuery';

interface CallControlsProps {
  visible: boolean;
  micOn: boolean;
  camOn: boolean;
  screenSharing: boolean;
  chatOpen: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onLeave: () => void;
  onCloseChat?: () => void;
}

export function CallControls({
  visible,
  micOn,
  camOn,
  screenSharing,
  chatOpen,
  onToggleMic,
  onToggleCam,
  onToggleScreenShare,
  onToggleChat,
  onLeave,
  onCloseChat,
}: CallControlsProps) {
  const isMobile = useIsMobile();
  const size = isMobile ? 'md' : 'lg';

  return (
    <footer
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-safe transition-all duration-300 ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      }`}
      aria-hidden={!visible}
    >
      <div className="pointer-events-auto mb-4 flex items-center gap-3 rounded-full border border-white/10 bg-black/55 px-4 py-2.5 shadow-2xl shadow-black/60 backdrop-blur-md sm:gap-5 sm:px-6 sm:py-3">
        <ControlButton
          label={micOn ? 'Микрофон' : 'Без звука'}
          active={micOn}
          onClick={onToggleMic}
          size={size}
        >
          {micOn ? <MicIcon /> : <MicOffIcon />}
        </ControlButton>
        <ControlButton
          label={camOn ? 'Камера' : 'Камера выкл'}
          active={camOn}
          onClick={onToggleCam}
          size={size}
        >
          {camOn ? <VideoOnIcon /> : <VideoOffIcon />}
        </ControlButton>
        <ControlButton
          label={screenSharing ? 'Остановить показ' : 'Демонстрация экрана'}
          active={screenSharing}
          highlight={screenSharing}
          onClick={onToggleScreenShare}
          size={size}
        >
          {screenSharing ? <ScreenShareOffIcon /> : <ScreenShareIcon />}
        </ControlButton>
        <ControlButton
          label={chatOpen ? 'Закрыть чат' : 'Чат'}
          active={!chatOpen}
          onClick={chatOpen ? onCloseChat ?? onToggleChat : onToggleChat}
          size={size}
        >
          <ChatIcon />
        </ControlButton>
        <span className="mx-0.5 h-8 w-px bg-white/15 sm:h-10" aria-hidden />
        <ControlButton label="Завершить вызов" danger onClick={onLeave} size={size}>
          <PhoneOffIcon />
        </ControlButton>
      </div>
    </footer>
  );
}
