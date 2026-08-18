import { useEffect, useRef, useState } from 'react';
import { ChatMessage } from '../hooks/useSignalingSocket';
import { SendIcon } from './icons';

interface ChatPanelProps {
  messages: ChatMessage[];
  currentUserId: string;
  onSend: (content: string) => void;
  onLoadMore?: () => void;
  onClose?: () => void;
  busy?: boolean;
}

const MAX_LENGTH = 2000;

function formatTime(createdAt: string): string {
  const ts = Number(createdAt);
  if (!Number.isFinite(ts) || ts <= 0) return '';
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ChatPanel({
  messages,
  currentUserId,
  onSend,
  onLoadMore,
  onClose,
  busy = false,
}: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const stickBottomRef = useRef(true);

  // Компонент рендерит content как React-строку (без dangerouslySetInnerHTML) —
  // это гарантирует экранирование HTML и защиту от XSS в чате.
  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (el.scrollTop < 40) onLoadMore?.();
  };

  useEffect(() => {
    const el = listRef.current;
    if (el && stickBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  const send = () => {
    const content = draft.trim();
    if (!content || content.length > MAX_LENGTH || busy) return;
    onSend(content);
    setDraft('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-semibold text-text">Чат комнаты</h3>
        {onClose && (
          <button
            type="button"
            aria-label="Закрыть чат"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-white/5 hover:text-text"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12" />
              <path d="M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>

      <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">Сообщений пока нет</p>
        )}
        <div className="space-y-2">
          {messages.map((message) => {
            const own = message.userId === currentUserId;
            return (
              <div key={message.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    own ? 'bg-accent/90 text-white' : 'bg-white/5 text-text'
                  }`}
                >
                  {!own && (
                    <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted">
                      {message.userId.slice(0, 8)}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  <div
                    className={`mt-0.5 text-right text-[10px] ${
                      own ? 'text-white/70' : 'text-muted'
                    }`}
                  >
                    {formatTime(message.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            maxLength={MAX_LENGTH}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send();
            }}
            placeholder="Сообщение…"
            className="w-full rounded-xl border border-border bg-bg px-4 py-2 text-sm text-text placeholder:text-muted/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          <button
            type="button"
            aria-label="Отправить"
            onClick={send}
            disabled={busy || !draft.trim()}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SendIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}