import { useCallback } from 'react';

import { usePlaybackStore } from '@/state/playbackStore';
import { pickRulerStep, fmtRulerTick } from '@/utils/timecode';
import { pxPerSec, pxToMs } from '@/utils/geometry';

interface TimelineRulerProps {
  widthPx: number;
  zoomLevel: number;
  /** Horizontal scroll offset of the parent .tl-scroll container. */
  scrollX: number;
}

/**
 * Sticky ruler at the top of the timeline scroll container.
 * Ticks are computed at render time — fast even at extreme zoom because we
 * only emit one DOM node per minor tick visible at this zoom.
 *
 * Drag (or click + drag) anywhere on the ruler seeks the playhead — mirrors
 * the prototype's "click to scrub" UX.
 */
export function TimelineRuler({ widthPx, zoomLevel, scrollX }: TimelineRulerProps) {
  const seek = usePlaybackStore((s) => s.seek);
  const pps = pxPerSec(zoomLevel);
  const secStep = pickRulerStep(pps);
  const minorStep = secStep / 5;
  const totalSec = widthPx / pps;

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Convert the click position into a project-time and start seeking;
      // attach document-level handlers for the drag so we keep scrubbing
      // even when the cursor leaves the ruler.
      const rect = e.currentTarget.getBoundingClientRect();
      const xInTrack = e.clientX - rect.left + scrollX;
      seek(pxToMs(xInTrack, zoomLevel));

      const onMove = (ev: MouseEvent) => {
        const xx = ev.clientX - rect.left + scrollX;
        seek(pxToMs(Math.max(0, xx), zoomLevel));
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [scrollX, zoomLevel, seek],
  );

  const ticks: React.ReactNode[] = [];
  // Iterate by index to avoid floating-point drift along the ruler.
  const minorCount = Math.ceil(totalSec / minorStep);
  for (let i = 0; i <= minorCount; i++) {
    const s = i * minorStep;
    const isMajor = i % 5 === 0;
    const x = s * pps;
    ticks.push(
      <div
        key={i}
        className={isMajor ? 'cc-tick' : 'cc-tick cc-tick-minor'}
        style={{ left: x }}
      >
        {isMajor && fmtRulerTick(s)}
      </div>,
    );
  }

  return (
    <div
      className="sticky top-0 z-[3] cursor-ew-resize select-none border-b border-line bg-surface-2"
      style={{ height: 'var(--ruler-h)' }}
      onMouseDown={onMouseDown}
    >
      <div className="relative h-full" style={{ width: widthPx }}>
        {ticks}
      </div>
    </div>
  );
}
