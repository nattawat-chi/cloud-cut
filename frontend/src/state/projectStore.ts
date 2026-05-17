import { create } from 'zustand';

import type {
  Clip,
  ClipEffect,
  EffectType,
  Project,
  Track,
  UUID,
} from '@/types';
import { EFFECT_META } from '@/types';
import {
  MOCK_CLIPS,
  MOCK_EFFECTS,
  MOCK_PROJECT,
  MOCK_TRACKS,
} from '@/mocks/cloudcut';
import { uid } from '@/utils/id';

/* =============================================================================
   projectStore — server-owned data (project, tracks, clips, effects).
   Every mutation is **optimistic-local** today; Phase 3 wires a debounced
   PATCH; Phase 5 reconciles with Pusher broadcasts.
   ============================================================================= */

export interface ProjectState {
  project: Project | null;
  tracks: readonly Track[];
  clips: readonly Clip[];
  /** Effects keyed by `clip.id`. Absent key === "no effects on this clip". */
  effects: Readonly<Record<UUID, readonly ClipEffect[]>>;

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  /**
   * Hydrate from the mock fixture. Replaced by `loadProject(id)` calling the
   * REST API once Phase 3 lands. Idempotent — safe to call from <App> mount.
   */
  loadMockProject: () => void;

  // ── Tracks ────────────────────────────────────────────────────────────────
  toggleTrack: (trackId: UUID, key: 'muted' | 'locked' | 'visible') => void;

  // ── Clips ─────────────────────────────────────────────────────────────────
  /** Create a fresh clip — used by drag-from-AssetBrowser drops. Returns new id. */
  addClip: (input: {
    trackId: UUID;
    assetId: UUID;
    posMs: number;
    durMs: number;
    name: string;
    thumbs?: readonly string[];
  }) => UUID;
  moveClip: (clipId: UUID, newPosMs: number, newTrackId?: UUID) => void;
  trimClip: (clipId: UUID, side: 'left' | 'right', newDurMs: number) => void;
  /** Single-call resize covering both left and right trim handles. */
  resizeClip: (clipId: UUID, newPosMs: number, newDurMs: number) => void;
  splitClipAt: (clipId: UUID, atMs: number) => void;
  deleteClips: (clipIds: readonly UUID[]) => void;

  // ── Effects ───────────────────────────────────────────────────────────────
  addEffect: (clipId: UUID, type: EffectType) => void;
  toggleEffect: (clipId: UUID, effectId: UUID) => void;
  updateEffect: (clipId: UUID, effectId: UUID, value: number) => void;
  removeEffect: (clipId: UUID, effectId: UUID) => void;
}

const EFFECT_DEFAULTS: Record<EffectType, number> = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  blur: 0,
};

export const useProjectStore = create<ProjectState>()((set) => ({
  project: null,
  tracks: [],
  clips: [],
  effects: {},

  loadMockProject: () =>
    set({
      project: MOCK_PROJECT,
      tracks: MOCK_TRACKS,
      clips: MOCK_CLIPS,
      effects: MOCK_EFFECTS,
    }),

  toggleTrack: (trackId, key) =>
    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === trackId ? { ...t, [key]: !t[key] } : t,
      ),
    })),

  addClip: ({ trackId, assetId, posMs, durMs, name, thumbs }) => {
    const id = uid('c');
    set((s) => ({
      clips: [
        ...s.clips,
        {
          id,
          trackId,
          assetId,
          name,
          posMs: Math.max(0, posMs),
          durMs: Math.max(400, durMs),
          inPointMs: 0,
          outPointMs: Math.max(400, durMs),
          transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
          thumbs,
          version: 1,
        },
      ],
    }));
    return id;
  },

  moveClip: (clipId, newPosMs, newTrackId) =>
    set((s) => ({
      clips: s.clips.map((c) =>
        c.id === clipId
          ? {
              ...c,
              posMs: Math.max(0, newPosMs),
              trackId: newTrackId ?? c.trackId,
              version: c.version + 1,
            }
          : c,
      ),
    })),

  resizeClip: (clipId, newPosMs, newDurMs) =>
    set((s) => ({
      clips: s.clips.map((c) =>
        c.id === clipId
          ? {
              ...c,
              posMs: Math.max(0, newPosMs),
              durMs: Math.max(400, newDurMs),
              version: c.version + 1,
            }
          : c,
      ),
    })),

  trimClip: (clipId, _side, newDurMs) =>
    set((s) => ({
      // Minimum clip duration of 400ms — same guardrail as the prototype's
      // drag handler. Prevents zero-width clips that break the layout.
      clips: s.clips.map((c) =>
        c.id === clipId
          ? { ...c, durMs: Math.max(400, newDurMs), version: c.version + 1 }
          : c,
      ),
    })),

  splitClipAt: (clipId, atMs) =>
    set((s) => {
      const out: Clip[] = [];
      for (const c of s.clips) {
        const local = atMs - c.posMs;
        if (c.id === clipId && local > 200 && local < c.durMs - 200) {
          const halfThumbs = c.thumbs ? c.thumbs.slice(Math.floor(c.thumbs.length / 2)) : undefined;
          out.push({ ...c, durMs: local, version: c.version + 1 });
          out.push({
            ...c,
            id: uid('c'),
            posMs: atMs,
            durMs: c.durMs - local,
            thumbs: halfThumbs,
            version: 1,
          });
        } else {
          out.push(c);
        }
      }
      return { clips: out };
    }),

  deleteClips: (clipIds) =>
    set((s) => {
      const drop = new Set(clipIds);
      if (drop.size === 0) return {};
      const nextEffects = { ...s.effects };
      for (const id of drop) delete nextEffects[id];
      return {
        clips: s.clips.filter((c) => !drop.has(c.id)),
        effects: nextEffects,
      };
    }),

  addEffect: (clipId, type) =>
    set((s) => {
      const meta = EFFECT_META[type];
      const value = EFFECT_DEFAULTS[type] ?? meta.min;
      const fx: ClipEffect = { id: uid('fx'), type, enabled: true, value };
      const existing = s.effects[clipId] ?? [];
      return { effects: { ...s.effects, [clipId]: [...existing, fx] } };
    }),

  toggleEffect: (clipId, effectId) =>
    set((s) => {
      const list = s.effects[clipId];
      if (!list) return {};
      return {
        effects: {
          ...s.effects,
          [clipId]: list.map((fx) =>
            fx.id === effectId ? { ...fx, enabled: !fx.enabled } : fx,
          ),
        },
      };
    }),

  updateEffect: (clipId, effectId, value) =>
    set((s) => {
      const list = s.effects[clipId];
      if (!list) return {};
      return {
        effects: {
          ...s.effects,
          [clipId]: list.map((fx) => (fx.id === effectId ? { ...fx, value } : fx)),
        },
      };
    }),

  removeEffect: (clipId, effectId) =>
    set((s) => {
      const list = s.effects[clipId];
      if (!list) return {};
      return {
        effects: { ...s.effects, [clipId]: list.filter((fx) => fx.id !== effectId) },
      };
    }),
}));

/* ─────────────────────────────────────────────────────────────────────────────
   Selectors — keep them outside the store so multiple components can share
   identity-stable references (the equality check in `useStore(selector)`
   skips re-renders when nothing changed).
   ───────────────────────────────────────────────────────────────────────────── */
export const selectTotalDurationMs = (s: ProjectState): number =>
  s.clips.reduce((m, c) => Math.max(m, c.posMs + c.durMs), 0);

export const selectClipById = (id: UUID) => (s: ProjectState): Clip | undefined =>
  s.clips.find((c) => c.id === id);

export const selectEffectsForClip = (id: UUID) => (s: ProjectState): readonly ClipEffect[] =>
  s.effects[id] ?? [];
