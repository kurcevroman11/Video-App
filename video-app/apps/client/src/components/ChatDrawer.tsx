import { ChatMessage } from '../hooks/useSignalingSocket';
import { ChatBody } from './ChatPanel';
import { CloseIcon } from './icons';

interface ChatDrawerProps {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  currentUserId: string;
  onSend: (text: string) => void;
  onLoadMore: () => void;
  busy: boolean;
}

export function ChatDrawer({
  open,
  onClose,
  messages,
  currentUserId,
  onSend,
  onLoadMore,
  busy,
}: ChatDrawerProps) {
  return (
    <>
      <div
        className={`absolute inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        role="dialog"
        aria-label="Чат"
        aria-hidden={!open}
        className={`absolute right-0 top-0 z-50 flex h-dvh w-full max-w-md flex-col border-l border-white/10 bg-surface/95 shadow-2xl shadow-black/60 backdrop-blur-md transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 pl-4 pr-3 pl-safe pt-safe">
          <h3 className="text-sm font-semibold text-text">Чат комнаты</h3>
          <button
            type="button"
            aria-label="Закрыть чат"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:bg-white/10 hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <ChatBody
          messages={messages}
          currentUserId={currentUserId}
          onSend={onSend}
          onLoadMore={onLoadMore}
          busy={busy}
          className="flex-1"
        />
      </aside>
    </>
  );
}
