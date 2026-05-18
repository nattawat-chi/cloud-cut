import { create } from 'zustand';

import { projects as projectsApi, timeline as timelineApi } from '@/services/api';
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
  /** Hydrate from the in-memory mock fixture (dev fallback). */
  loadMockProject: () => void;
  /** Hydrate from the backend — fetches `/projects/:id` + `/projects/:id/timeline`. */
  loadProjectFromApi: (projectId: UUID) => Promise<void>;

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

  loadProjectFromApi: async (projectId) => {
    const [project, snapshot] = await Promise.all([
      projectsApi.get(projectId),
      timelineApi.get(projectId),
    ]);

    const tracks: Track[] = snapshot.tracks
      .filter((t) => t.kind === 'video' || t.kind === 'audio')
      .map((t, i) => {
        const isVideo = t.kind === 'video';
        // Alternate colour vars within each track type
        const colorVar = isVideo
          ? i % 2 === 0 ? ('--clip-v-1' as const) : ('--clip-v-2' as const)
          : i % 2 === 0 ? ('--clip-a-1' as const) : ('--clip-a-2' as const);
        const tag = `${isVideo ? 'V' : 'A'}${Math.floor(i / 2) + 1}`;
        return {
          id: t.id,
          type: isVideo ? 'video' : 'audio',
          label: `${tag} · ${t.name}`,
          tag,
          colorVar,
          muted: t.muted,
          locked: t.locked,
          visible: true,
        };
      });

    const clips: Clip[] = snapshot.clips.map((c) => ({
      id: c.id,
      trackId: c.track_id,
      assetId: c.asset_id ?? '',
      name: c.name,
      posMs: c.pos_ms,
      durMs: c.dur_ms,
      inPointMs: c.trim_in_ms,
      outPointMs: c.trim_in_ms + c.dur_ms,
      transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
      version: c.version,
    }));

    const effects: Record<UUID, ClipEffect[]> = {};
    for (const [clipId, list] of Object.entries(snapshot.effects)) {
      effects[clipId] = list
        .filter((fx) => (['brightness', 'contrast', 'saturation', 'blur'] as const).includes(fx.type as EffectType))
        .map((fx) => ({
          id: fx.id,
          type: fx.type as EffectType,
          enabled: fx.enabled,
          value: fx.value,
        }));
    }

    set({
      project: {
        id: project.id,
        name: project.name,
        workspace: project.workspace_id,
        fps: project.fps,
        resolution: `${project.resolution_w}×${project.resolution_h}`,
        durationMs: project.duration_ms,
      },
      tracks,
      clips,
      effects,
    });
  },

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
