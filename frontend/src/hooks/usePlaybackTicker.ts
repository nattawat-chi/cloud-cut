import { useEffect } from 'react';

import { usePlaybackStore } from '@/state/playbackStore';
import { useProjectStore } from '@/state/projectStore';

/**
 * Drives `currentTimeMs` via `requestAnimationFrame` while `isPlaying`.
 * Stops the loop and pauses when the project's duration is hit.
 *
 * Subscribes directly to the stores via `getState()` inside the RAF
 * callback rather than through React selectors, so the loop reads fresh
 * values without re-running the effect every frame.
 */
export function usePlaybackTicker(): void {
  const isPlaying = usePlaybackStore((s) => s.isPlaying);

  useEffect(() => {
    if (!isPlaying) return;

    let last = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const dt = now - last;
      last = now;

      const playback = usePlaybackStore.getState();
      const project = useProjectStore.getState().project;
      if (!project) return; // no project loaded — stop silently

      const next = playback.currentTimeMs + dt * playback.playbackSpeed;
      if (next >= project.durationMs) {
        // Loop to start + auto-pause so the user notices the loop boundary.
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
