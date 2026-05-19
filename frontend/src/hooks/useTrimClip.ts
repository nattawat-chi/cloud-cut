import { useCallback, useRef } from 'react';

import { useProjectStore } from '@/state/projectStore';
import type { UUID } from '@/types';
import { pxToMs } from '@/utils/geometry';

type TrimEdge = 'start' | 'end';

interface TrimState {
  edge: TrimEdge;
  originX: number;
  originMs: number;
}

/**
 * Returns pointer-event handlers for trimming the start or end of a clip.
 * Snapshots undo state on pointerdown.
 */
export function useTrimClip(clipId: UUID, trimInMs: number, durMs: number, pxPerSecond: number) {
  const trim = useRef<TrimState | null>(null);
  const trimClip = useProjectStore((s) => s.trimClip);
  const snapshotNow = useProjectStore((s) => s.snapshotNow);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, edge: TrimEdge) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      snapshotNow();
      trim.current = {
        edge,
        originX: e.clientX,
        originMs: edge === 'start' ? trimInMs : durMs,
      };
    },
    [durMs, snapshotNow, trimInMs],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!trim.current) return;
      const deltaPx = e.clientX - trim.current.originX;
      const deltaMs = pxToMs(deltaPx, pxPerSecond);
      trimClip(clipId, trim.current.edge, trim.current.originMs + deltaMs);
    },
    [clipId, pxPerSecond, trimClip],
  );

  const onPointerUp = useCallback(() => {
    trim.current = null;
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp };
}
