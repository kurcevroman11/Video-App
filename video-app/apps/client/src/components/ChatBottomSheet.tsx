import { useEffect, useRef, useState } from 'react';
import { ChatMessage } from '../hooks/useSignalingSocket';
import { ChatBody } from './ChatPanel';
import { DragHandleIcon } from './icons';

interface ChatBottomSheetProps {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  currentUserId: string;
  onSend: (text: string) => void;
  onLoadMore: () => void;
  busy: boolean;
}

const SHEET_HEIGHT_VH = 70;
const DISMISS_VELOCITY = 0.5;
const DISMISS_DISTANCE = 90;

export function ChatBottomSheet({
  open,
  onClose,
  messages,
  currentUserId,
  onSend,
  onLoadMore,
  busy,
}: ChatBottomSheetProps) {
  const [dragOffset, setDragOffset] = useState(0);
  const startRef = useRef<{ y: number; t: number } | null>(null);

  useEffect(() => {
    if (!open) {
      setDragOffset(0);
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    startRef.current = { y: e.clientY, t: Date.now() };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current) return;
    const dy = e.clientY - startRef.current.y;
    setDragOffset(Math.max(0, dy));
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current) return;
    const dt = Date.now() - startRef.current.t;
    const velocity = (e.clientY - startRef.current.y) / Math.max(dt, 1);
    startRef.current = null;
    if (dragOffset > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) {
      onClose();
    }
    setDragOffset(0);
  };

  return (
    <div
      className={`absolute inset-0 z-50 transition-opacity duration-200 ${
        open ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      aria-hidden={!open}
    >
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-label="Чат"
        className="absolute inset-x-0 bottom-0 flex max-h-[90dvh] flex-col rounded-t-2xl border-t border-white/10 bg-surface shadow-2xl shadow-black/70 transition-transform duration-300"
        style={{
          height: `${SHEET_HEIGHT_VH}dvh`,
          transform: `translateY(${open ? dragOffset : '100%'}px)`,
          transition: dragOffset === 0 ? 'transform 300ms ease-out' : 'none',
        }}
      >
        <div
          className="flex shrink-0 cursor-grab items-center justify-center pt-2 pb-1 active:cursor-grabbing"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <span className="rounded-full bg-white/15 p-1.5 text-muted">
            <DragHandleIcon className="h-5 w-5" />
          </span>
        </div>
        <ChatBody
          messages={messages}
          currentUserId={currentUserId}
          onSend={onSend}
          onLoadMore={onLoadMore}
          busy={busy}
          className="flex-1"
        />
      </section>
    </div>
  );
}
