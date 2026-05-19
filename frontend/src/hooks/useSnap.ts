import { useUIStore } from '@/state/uiStore';
import type { Clip } from '@/types';
import { snap as snapMath } from '@/utils/geometry';

const SNAP_THRESHOLD_MS = 150;

/**
 * Returns a function that snaps a position (ms) to the nearest clip edge or
 * playhead. No-ops when snap is disabled in uiStore.
 */
export function useSnap(clips: readonly Clip[]) {
  const snapEnabled = useUIStore((s) => s.snapEnabled);

  const snapPosition = (posMs: number, excludeClipId?: string): number => {
    if (!snapEnabled) return posMs;

    const edges: number[] = [];
    for (const clip of clips) {
      if (clip.id === excludeClipId) continue;
      edges.push(clip.posMs, clip.posMs + clip.durMs);
    }
    edges.push(0); // timeline start

    return snapMath(posMs, edges, SNAP_THRESHOLD_MS);
  };

  return { snapEnabled, snapPosition };
}
