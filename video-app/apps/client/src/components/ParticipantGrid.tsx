import { VideoTile } from './VideoTile';
import { SpinnerIcon } from './icons';

export interface RemoteParticipant {
  userId: string;
  source: 'camera' | 'screen';
  stream: MediaStream | null;
}

interface ParticipantGridProps {
  participants: RemoteParticipant[];
  waiting: boolean;
}

export function ParticipantGrid({ participants, waiting }: ParticipantGridProps) {
  if (participants.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="animate-pulse-soft flex items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-sm text-white/90 backdrop-blur">
          <SpinnerIcon className="h-4 w-4 text-accent" />
          {waiting ? 'Ожидаем участников…' : 'Установление соединения…'}
        </div>
      </div>
    );
  }

  if (participants.length === 1) {
    const p = participants[0];
    return (
      <div className="flex h-full w-full items-center justify-center p-2 sm:p-4">
        <VideoTile
          stream={p.stream}
          label={`Участник ${p.userId.slice(0, 8)}`}
          showPlaceholder={!p.stream}
          placeholder="Соединение…"
          className="aspect-video h-full max-h-full w-full rounded-xl animate-fade-in"
        />
      </div>
    );
  }

  const cols = participants.length <= 4 ? 2 : 3;
  const overflow = participants.length > 6;

  return (
    <div
      className={`grid h-full w-full gap-1.5 p-1.5 sm:gap-2 sm:p-2 ${
        overflow ? 'overflow-y-auto' : 'overflow-hidden'
      }`}
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridAutoRows: 'minmax(0, 1fr)',
      }}
    >
      {participants.map((p) => (
        <div
          key={`${p.userId}-${p.source}`}
          className="min-h-0 animate-fade-in"
        >
          <VideoTile
            stream={p.stream}
            label={`Участник ${p.userId.slice(0, 8)}`}
            showPlaceholder={!p.stream}
            placeholder="Соединение…"
            className="aspect-video h-full w-full rounded-lg"
          />
        </div>
      ))}
    </div>
  );
}
