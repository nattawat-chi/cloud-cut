import { useCallback, useRef } from 'react';

import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import type { UUID } from '@/types';
import { pxToMs } from '@/utils/geometry';

interface DragState {
  clipId: UUID;
  originX: number;
  originMs: number;
}

/**
 * Returns pointer-event handlers that move a clip along the timeline.
 * Snaps to edges when snap is enabled. Snapshots undo state on pointerdown.
 */
export function useDragClip(clipId: UUID, posMs: number, pxPerSecond: number) {
  const drag = useRef<DragState | null>(null);
  const moveClip = useProjectStore((s) => s.moveClip);
  const snapshotNow = useProjectStore((s) => s.snapshotNow);
  const snapEnabled = useUIStore((s) => s.snapEnabled);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      snapshotNow();
      drag.current = { clipId, originX: e.clientX, originMs: posMs };
    },
    [clipId, posMs, snapshotNow],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag.current) return;
      const deltaPx = e.clientX - drag.current.originX;
      const deltaMs = pxToMs(deltaPx, pxPerSecond);
      const newPos = Math.max(0, drag.current.originMs + deltaMs);
      moveClip(clipId, newPos, snapEnabled);
    },
    [clipId, moveClip, pxPerSecond, snapEnabled],
  );

  const onPointerUp = useCallback(() => {
    drag.current = null;
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp };
}
