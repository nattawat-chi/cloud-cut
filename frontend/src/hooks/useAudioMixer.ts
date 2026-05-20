import { useEffect } from 'react';

import { useAssetsStore } from '@/state/assetsStore';
import { usePlaybackStore } from '@/state/playbackStore';
import { useProjectStore } from '@/state/projectStore';

/**
 * Creates hidden <audio> elements for every audio-track clip that has a
 * proxyUrl and keeps them synced to the playback transport (play/pause,
 * seek, volume, mute).
 *
 * Uses Zustand's subscribe() rather than React selectors so the sync loop
 * runs outside React's render cycle — no re-renders on every RAF frame.
 */
export function useAudioMixer(): void {
  const clips = useProjectStore((s) => s.clips);
  const tracks = useProjectStore((s) => s.tracks);

  useEffect(() => {
    const audioTrackIds = new Set(
      tracks.filter((t) => t.type === 'audio').map((t) => t.id),
    );
    const mutedTrackIds = new Set(
      tracks.filter((t) => t.type === 'audio' && t.muted).map((t) => t.id),
    );
    const audioClips = clips.filter((c) => audioTrackIds.has(c.trackId));

    // clipId → HTMLAudioElement. Lazily created when proxyUrl becomes available.
    const elements = new Map<string, HTMLAudioElement>();

    function sync({ currentTimeMs, isPlaying, volume, isMuted }: {
      currentTimeMs: number;
      isPlaying: boolean;
      volume: number;
      isMuted: boolean;
    }) {
      const assetsById = useAssetsStore.getState().byId;

      for (const clip of audioClips) {
        const proxyUrl = assetsById[clip.assetId]?.proxyUrl;

        let el = elements.get(clip.id);
        if (!el && proxyUrl) {
          el = document.createElement('audio');
          el.preload = 'auto';
          el.src = proxyUrl;
          elements.set(clip.id, el);
        }
        if (!el) continue;

        el.volume = Math.max(0, Math.min(1, volume));
        el.muted = isMuted;

        const isActive =
          currentTimeMs >= clip.posMs && currentTimeMs < clip.posMs + clip.durMs;
        const trackMuted = mutedTrackIds.has(clip.trackId);

        if (isActive && isPlaying && !trackMuted) {
          const clipLocalMs = currentTimeMs - clip.posMs + (clip.inPointMs ?? 0);
          const targetSec = Math.max(0, clipLocalMs / 1000);
          // Only hard-seek when drift exceeds 250 ms — same threshold as VideoPlayer
          // so audio stays in sync without fighting the native clock during smooth play.
          if (Math.abs(el.currentTime - targetSec) > 0.25) {
            el.currentTime = targetSec;
          }
          if (el.paused) el.play().catch(() => {});
        } else {
          if (!el.paused) el.pause();
        }
      }
    }

    // Sync immediately in case isPlaying is already true when the effect mounts.
    sync(usePlaybackStore.getState());

    const unsub = usePlaybackStore.subscribe(sync);

    return () => {
      unsub();
      for (const el of elements.values()) {
        el.pause();
        el.src = '';
      }
      elements.clear();
    };
  }, [clips, tracks]);
}
