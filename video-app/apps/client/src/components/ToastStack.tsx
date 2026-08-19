import { AlertIcon } from './icons';

interface ToastStackProps {
  messages: string[];
  onDismiss?: (index: number) => void;
}

export function ToastStack({ messages, onDismiss }: ToastStackProps) {
  if (messages.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-40 flex flex-col items-center gap-2 px-3 sm:bottom-28">
      {messages.map((msg, idx) => (
        <div
          key={`${idx}-${msg}`}
          className="pointer-events-auto animate-float-in flex max-w-md items-center gap-2 rounded-xl border border-danger/40 bg-danger/15 px-4 py-2.5 text-sm text-white shadow-lg shadow-black/40 backdrop-blur-md"
          onClick={() => onDismiss?.(idx)}
          role="alert"
        >
          <AlertIcon className="h-4 w-4 flex-shrink-0 text-danger" />
          <span className="flex-1">{msg}</span>
        </div>
      ))}
    </div>
  );
}
