import { useEffect, useRef } from 'react';

interface VideoTileProps {
  stream: MediaStream | null;
  mirror?: boolean;
  label?: string;
  className?: string;
  showPlaceholder?: boolean;
  placeholder?: string;
  fit?: 'cover' | 'contain';
  muted?: boolean;
}

export function VideoTile({
  stream,
  mirror = false,
  label,
  className = '',
  showPlaceholder = false,
  placeholder,
  fit = 'cover',
  muted,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => undefined);
    }
  }, [stream]);

  const collapsed = showPlaceholder || !stream;
  const fitClass = collapsed ? 'object-cover opacity-0' : `object-${fit}`;
  const isMuted = muted ?? mirror;

  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        muted={isMuted}
        playsInline
        className={`h-full w-full transition-opacity ${fitClass} ${mirror ? '-scale-x-100' : ''}`}
      />
      {collapsed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-muted">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20a8 8 0 0 1 16 0" />
            </svg>
          </div>
          {placeholder && <p className="px-6 text-center text-sm text-muted">{placeholder}</p>}
        </div>
      )}
      {label && !collapsed && (
        <span className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white/90 backdrop-blur-sm">
          {label}
        </span>
      )}
    </div>
  );
}
