import { create } from 'zustand';

/* =============================================================================
   playbackStore — transport state (currentTime, isPlaying, speed, volume).
   Isolated from projectStore so the requestAnimationFrame ticker doesn't
   trigger Timeline/Inspector re-renders.
   ============================================================================= */

export interface PlaybackState {
  currentTimeMs: number;
  isPlaying: boolean;
  /** 0.25, 0.5, 1, 1.5, 2 — same set the prototype exposes. */
  playbackSpeed: number;
  volume: number;
  isMuted: boolean;

  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  /** Seek clamps against `[0, durationMs]` at the caller — store only sets value. */
  seek: (timeMs: number) => void;
  setSpeed: (speed: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
}

export const usePlaybackStore = create<PlaybackState>()((set) => ({
  currentTimeMs: 8200,
  isPlaying: false,
  playbackSpeed: 1,
  volume: 0.85,
  isMuted: false,

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  seek: (timeMs) => set({ currentTimeMs: Math.max(0, timeMs) }),
  setSpeed: (speed) => set({ playbackSpeed: speed }),
  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
}));
