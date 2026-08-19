import { VideoTile } from './VideoTile';

interface ScreenShareViewProps {
  stream: MediaStream | null;
  label: string;
  className?: string;
}

export function ScreenShareView({ stream, label, className = '' }: ScreenShareViewProps) {
  return (
    <div className={`flex h-full w-full items-center justify-center p-2 sm:p-4 ${className}`}>
      <VideoTile
        stream={stream}
        label={label}
        fit="contain"
        showPlaceholder={!stream}
        placeholder="Демонстрация экрана…"
        className="aspect-video h-full max-h-full w-full rounded-xl bg-black animate-fade-in"
      />
    </div>
  );
}
