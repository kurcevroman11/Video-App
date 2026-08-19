import { useCallback, useEffect, useRef, useState } from 'react';

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface UseDraggableCornerOptions {
  initialCorner?: Corner;
  margin?: number;
  estimatedWidth?: number;
  estimatedHeight?: number;
}

interface UseDraggableCornerReturn {
  corner: Corner;
  style: { left: number; top: number; right?: never; bottom?: never };
  isDragging: boolean;
  elementRef: React.RefObject<HTMLDivElement>;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export function useDraggableCorner({
  initialCorner = 'bottom-right',
  margin = 16,
  estimatedWidth = 120,
  estimatedHeight = 160,
}: UseDraggableCornerOptions = {}): UseDraggableCornerReturn {
  const [corner, setCorner] = useState<Corner>(initialCorner);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);
  const dragOriginRef = useRef<{
    pointerX: number;
    pointerY: number;
    startLeft: number;
    startTop: number;
  } | null>(null);

  const computeSnap = useCallback(
    (left: number, top: number): { left: number; top: number; corner: Corner } => {
      const w = elementRef.current?.offsetWidth ?? estimatedWidth;
      const h = elementRef.current?.offsetHeight ?? estimatedHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const clampedLeft = Math.max(margin, Math.min(vw - w - margin, left));
      const clampedTop = Math.max(margin, Math.min(vh - h - margin, top));

      const centerX = clampedLeft + w / 2;
      const centerY = clampedTop + h / 2;
      const nextCorner: Corner =
        centerX < vw / 2
          ? centerY < vh / 2
            ? 'top-left'
            : 'bottom-left'
          : centerY < vh / 2
            ? 'top-right'
            : 'bottom-right';

      const alignedLeft = nextCorner === 'top-left' || nextCorner === 'bottom-left' ? margin : vw - w - margin;
      const alignedTop = nextCorner === 'top-left' || nextCorner === 'top-right' ? margin : vh - h - margin;

      return { left: alignedLeft, top: alignedTop, corner: nextCorner };
    },
    [margin, estimatedWidth, estimatedHeight]
  );

  useEffect(() => {
    if (isDragging) return;
    const rect = computeSnap(0, 0);
    setPos({ left: rect.left, top: rect.top });
  }, [corner, isDragging, computeSnap]);

  useEffect(() => {
    if (!isDragging) return;
    const onResize = () => {
      const rect = computeSnap(
        elementRef.current?.getBoundingClientRect().left ?? 0,
        elementRef.current?.getBoundingClientRect().top ?? 0
      );
      setPos({ left: rect.left, top: rect.top });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isDragging, computeSnap]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = elementRef.current;
      if (!el) return;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      const rect = el.getBoundingClientRect();
      setPos({ left: rect.left, top: rect.top });
      dragOriginRef.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        startLeft: rect.left,
        startTop: rect.top,
      };
      setIsDragging(true);
    },
    []
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging || !dragOriginRef.current) return;
      const dx = e.clientX - dragOriginRef.current.pointerX;
      const dy = e.clientY - dragOriginRef.current.pointerY;
      const nextLeft = dragOriginRef.current.startLeft + dx;
      const nextTop = dragOriginRef.current.startTop + dy;
      const w = elementRef.current?.offsetWidth ?? estimatedWidth;
      const h = elementRef.current?.offsetHeight ?? estimatedHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const clampedLeft = Math.max(margin, Math.min(vw - w - margin, nextLeft));
      const clampedTop = Math.max(margin, Math.min(vh - h - margin, nextTop));
      setPos({ left: clampedLeft, top: clampedTop });
    },
    [isDragging, margin, estimatedWidth, estimatedHeight]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging || !dragOriginRef.current) return;
      const el = elementRef.current;
      if (el) {
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {
          /* noop */
        }
      }
      const rect = el?.getBoundingClientRect();
      const snap = computeSnap(rect?.left ?? 0, rect?.top ?? 0);
      setPos({ left: snap.left, top: snap.top });
      setCorner(snap.corner);
      setIsDragging(false);
      dragOriginRef.current = null;
    },
    [isDragging, computeSnap]
  );

  return {
    corner,
    style: pos ?? { left: 0, top: 0 },
    isDragging,
    elementRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
