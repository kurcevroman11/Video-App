import { useEffect, useRef } from 'react';

interface VideoTileProps {
  stream: MediaStream | null;
  mirror?: boolean;
  label?: string;
  className?: string;
  showPlaceholder?: boolean;
  placeholder?: string;
}

export function VideoTile({
  stream,
  mirror = false,
  label,
  className = '',
  showPlaceholder = false,
  placeholder,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current
        .play()
        .catch(() => undefined);
    }
  }, [stream]);

  return (
    <div className={`relative overflow-hidden bg-surface-2 ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        muted={mirror}
        playsInline
        className={`h-full w-full object-cover ${mirror ? '-scale-x-100' : ''} ${
          stream ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {(!stream || showPlaceholder) && (
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
      {label && stream && (
        <span className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/45 px-2 py-1 text-xs font-medium text-white/90">
          {label}
        </span>
      )}
    </div>
  );
}