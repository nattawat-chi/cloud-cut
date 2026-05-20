import { useEffect } from 'react';

import { usePlaybackStore } from '@/state/playbackStore';
import { selectTotalDurationMs, useProjectStore } from '@/state/projectStore';

/**
 * Drives `currentTimeMs` via `requestAnimationFrame` while `isPlaying`.
 * Stops the loop and pauses when the project's duration is hit.
 *
 * Subscribes directly to the stores via `getState()` inside the RAF
 * callback rather than through React selectors, so the loop reads fresh
 * values without re-running the effect every frame.
 *
 * Duration is derived from clips rather than `project.durationMs` — the DB
 * field starts at 0 for new projects and is only updated by an explicit PATCH,
 * so clip-derived duration is the only reliable stop boundary.
 */
export function usePlaybackTicker(): void {
  const isPlaying = usePlaybackStore((s) => s.isPlaying);

  useEffect(() => {
    if (!isPlaying) return;

    // If the playhead is already past all content (e.g. initial value of 8200ms
    // on an empty or short project), reset to the beginning so Play is instant.
    const totalDuration = selectTotalDurationMs(useProjectStore.getState());
    if (totalDuration > 0 && usePlaybackStore.getState().currentTimeMs >= totalDuration) {
      usePlaybackStore.setState({ currentTimeMs: 0 });
    }

    let last = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const dt = now - last;
      last = now;

      const playback = usePlaybackStore.getState();
      if (!useProjectStore.getState().project) return; // no project — stop silently

      const duration = selectTotalDurationMs(useProjectStore.getState());
      if (duration === 0) {
        // No clips on the timeline yet — nothing to play.
        usePlaybackStore.setState({ isPlaying: false });
        return;
      }

      const next = playback.currentTimeMs + dt * playback.playbackSpeed;
      if (next >= duration) {
        // Reached the end — auto-pause and loop to start.
        usePlaybackStore.setState({ isPlaying: false, currentTimeMs: 0 });
        return;
      }

      usePlaybackStore.setState({ currentTimeMs: next });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);
}
