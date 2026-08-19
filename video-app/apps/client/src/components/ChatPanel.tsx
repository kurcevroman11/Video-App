import { useEffect, useRef, useState } from 'react';
import { ChatMessage } from '../hooks/useSignalingSocket';
import { SendIcon } from './icons';

export interface ChatBodyProps {
  messages: ChatMessage[];
  currentUserId: string;
  onSend: (content: string) => void;
  onLoadMore?: () => void;
  busy?: boolean;
  footerHint?: string;
  className?: string;
}

const MAX_LENGTH = 2000;

function formatTime(createdAt: string): string {
  const ts = Number(createdAt);
  if (!Number.isFinite(ts) || ts <= 0) return '';
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ChatBody({
  messages,
  currentUserId,
  onSend,
  onLoadMore,
  busy = false,
  footerHint,
  className = '',
}: ChatBodyProps) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const stickBottomRef = useRef(true);

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
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
      <div
        ref={listRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-3"
      >
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
                    own ? 'bg-accent/90 text-white' : 'bg-white/10 text-text'
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

      <div className="border-t border-white/10 p-3 pb-safe">
        {footerHint && (
          <p className="mb-2 text-center text-xs text-muted">{footerHint}</p>
        )}
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
            className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm text-text placeholder:text-muted/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          <button
            type="button"
            aria-label="Отправить"
            onClick={send}
            disabled={busy || !draft.trim()}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-accent text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SendIcon className="h-4 w-4" />
          </button>
        </div>
        {draft.length > 0 && (
          <p className="mt-1 text-right text-[10px] text-muted">
            {draft.length}/{MAX_LENGTH}
          </p>
        )}
      </div>
    </div>
  );
}
