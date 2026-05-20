import { useCallback } from 'react';

import { usePlaybackStore } from '@/state/playbackStore';
import { msToPx, pxToMs } from '@/utils/geometry';

interface PlayheadProps {
  currentTimeMs: number;
  zoomLevel: number;
}

/**
 * Vertical accent line spanning the full timeline content height + a
 * downward-pointing triangle handle at the top. Lives inside `.tl-inner`
 * so horizontal scrolling moves it with the rows naturally.
 *
 * The vertical line stays `pointer-events: none` so it never swallows clicks
 * on clips passing under it. The triangle handle at the top opts back in
 * (`pointer-events: auto`) so the user can grab and drag it to scrub.
 */
export function Playhead({ currentTimeMs, zoomLevel }: PlayheadProps) {
  const left = msToPx(currentTimeMs, zoomLevel);

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      // Use the parent .tl-inner as the coordinate origin so the math matches
      // ruler/clip drag (which both read from `.tl-inner`'s bounding rect).
      const innerEl = (e.currentTarget.closest('.tl-inner') as HTMLDivElement | null);
      if (!innerEl) return;
      const innerRect = innerEl.getBoundingClientRect();
      const { seek } = usePlaybackStore.getState();

      const onMove = (ev: MouseEvent) => {
        const x = ev.clientX - innerRect.left;
        seek(pxToMs(Math.max(0, x), zoomLevel));
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [zoomLevel],
  );

  return (
    <div
      className="pointer-events-none absolute top-0 bottom-0 z-[6]"
      style={{ left, width: 1, background: 'var(--accent)' }}
    >
      {/* Triangle handle — opts back into pointer-events so it's draggable. */}
      <div
        onMouseDown={onHandleMouseDown}
        title="Drag to scrub"
        className="pointer-events-auto absolute cursor-ew-resize"
        style={{
          top: 0,
          left: -7,
          width: 15,
          height: 12,
          background: 'var(--accent)',
          clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
        }}
      />
    </div>
  );
}
