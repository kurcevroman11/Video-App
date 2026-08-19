import { useDraggableCorner, Corner } from '../hooks/useDraggableCorner';
import { VideoTile } from './VideoTile';
import { useIsMobile } from '../hooks/useMediaQuery';

interface LocalVideoPiPProps {
  stream: MediaStream | null;
  micOn: boolean;
  visible: boolean;
  initialCorner?: Corner;
  size?: 'sm' | 'md';
}

const SIZE_MAP = {
  sm: { dim: 'w-24 sm:w-28', estimated: { w: 112, h: 150 } },
  md: { dim: 'w-32 sm:w-36', estimated: { w: 144, h: 192 } },
} as const;

export function LocalVideoPiP({
  stream,
  micOn,
  visible,
  initialCorner = 'bottom-right',
  size = 'sm',
}: LocalVideoPiPProps) {
  const isMobile = useIsMobile();
  const cfg = SIZE_MAP[size];
  const drag = useDraggableCorner({
    initialCorner,
    margin: 12,
    estimatedWidth: cfg.estimated.w,
    estimatedHeight: cfg.estimated.h,
  });

  return (
    <div
      ref={drag.elementRef}
      onPointerDown={isMobile ? drag.onPointerDown : undefined}
      onPointerMove={isMobile ? drag.onPointerMove : undefined}
      onPointerUp={isMobile ? drag.onPointerUp : undefined}
      onPointerCancel={isMobile ? drag.onPointerUp : undefined}
      className={`absolute z-20 ${isMobile ? 'pip-drag' : ''} ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      style={{
        left: drag.style.left,
        top: drag.style.top,
        transition: drag.isDragging ? 'none' : 'left 220ms ease-out, top 220ms ease-out, opacity 300ms',
      }}
    >
      <div
        className={`overflow-hidden rounded-2xl border border-white/20 shadow-2xl shadow-black/60 ${cfg.dim}`}
      >
        <VideoTile
          stream={stream}
          mirror
          label={micOn ? 'Вы' : 'Без звука'}
          showPlaceholder={!stream}
          placeholder="Камера выкл."
          className="aspect-[3/4] w-full"
        />
      </div>
    </div>
  );
}
