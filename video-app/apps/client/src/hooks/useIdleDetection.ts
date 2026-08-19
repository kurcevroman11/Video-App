import { useEffect, useState } from 'react';

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'touchstart',
  'touchmove',
  'keydown',
  'wheel',
  'pointerdown',
] as const;

export function useIdleDetection(idleMs = 3000, paused = false): boolean {
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (paused) {
      setActive(true);
      return;
    }

    let timer: number | undefined;
    const reset = () => {
      setActive(true);
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => setActive(false), idleMs);
    };

    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, reset, { passive: true }));
    reset();

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, reset));
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [idleMs, paused]);

  return active;
}
