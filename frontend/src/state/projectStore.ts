import { create } from 'zustand';

import { projects as projectsApi, timeline as timelineApi, tracks as tracksApi, workspaces as workspacesApi } from '@/services/api';
import { usePlaybackStore } from '@/state/playbackStore';
import { useUIStore } from '@/state/uiStore';
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

/**
 * Immutable snapshot used by the local undo stack. Holds the three slices that
 * change during edits — project metadata (fps/resolution) doesn't get reverted.
 */
interface ProjectSnapshot {
  readonly tracks: readonly Track[];
  readonly clips: readonly Clip[];
  readonly effects: Readonly<Record<UUID, readonly ClipEffect[]>>;
}

export type ProjectRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type WorkspacePlan = 'free' | 'pro' | 'team';

export interface WorkspaceSummary {
  readonly id: string;
  readonly name: string;
  readonly role: ProjectRole;
  readonly plan: WorkspacePlan;
}

export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly fps: number;
  readonly resolution: string;
}

export interface ProjectState {
  project: Project | null;
  tracks: readonly Track[];
  clips: readonly Clip[];
  /** Effects keyed by `clip.id`. Absent key === "no effects on this clip". */
  effects: Readonly<Record<UUID, readonly ClipEffect[]>>;
  /** Local undo stack — most-recent first. Capped to avoid unbounded growth. */
  _undoStack: readonly ProjectSnapshot[];
  /** Redo stack — populated when undo runs. Cleared on any new mutation. */
  _redoStack: readonly ProjectSnapshot[];
  /** Current user's role in this project's workspace. Null until loaded. */
  myRole: ProjectRole | null;
  setMyRole: (role: string | null) => void;

  /** Workspace + project switching state. */
  currentWorkspaceId: string | null;
  availableWorkspaces: readonly WorkspaceSummary[];
  availableProjects: readonly ProjectSummary[];

  /** Fetch the user's workspaces and store summaries in `availableWorkspaces`. */
  refreshWorkspaces: () => Promise<void>;
  /** Fetch the projects in `workspaceId` and store summaries in `availableProjects`. */
  refreshProjects: (workspaceId: string) => Promise<void>;
  /** Switch to a different workspace — updates role, fetches its projects, and loads the first one. */
  selectWorkspace: (workspaceId: string) => Promise<void>;
  /** Load a different project within the current workspace. */
  selectProject: (projectId: string) => Promise<void>;
  /** Create a new project in the given workspace and switch to it. */
  createProject: (workspaceId: string, name: string, fps?: number, resW?: number, resH?: number) => Promise<void>;
  /** Update the current project's name and/or video settings. */
  updateProject: (patch: { name?: string; fps?: number; resW?: number; resH?: number }) => Promise<void>;
  /** Create a new workspace, switch to it, and create a default project. */
  createWorkspace: (name: string) => Promise<void>;
  /** Add a new track to the current project and reload the timeline. */
  addTrack: (kind: 'video' | 'audio', name: string) => Promise<void>;
  /** Delete a track (and all its clips) from the current project. */
  deleteTrack: (trackId: UUID) => Promise<void>;
  /** Archive (soft-delete) a project and switch to the next available one. */
  archiveProject: (projectId: string) => Promise<void>;

  /** Pop the latest snapshot and restore it. No-op when stack is empty.
   *  Returns true if anything was reverted. */
  undoLocal: () => boolean;
  /** Redo a previously-undone mutation. Returns true on success. */
  redoLocal: () => boolean;
  /** True when there's at least one snapshot to undo. */
  canUndoLocal: () => boolean;
  /**
   * Capture the current state onto the undo stack without changing anything
   * else. Call this at the START of an interactive drag (mousedown) so the
   * entire drag is one undoable step, not one snapshot per mousemove frame.
   */
  snapshotNow: () => void;

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
  /**
   * Clipboard for clip copy/paste. Snapshot-only — the array stores the
   * Clip shape at copy time so subsequent edits to the source clips don't
   * mutate what will get pasted.
   */
  _clipboard: readonly Clip[];
  /** Copy the given clips into the in-memory clipboard. */
  copyClips: (clipIds: readonly UUID[]) => void;
  /**
   * Paste clipboard contents at the current playhead. The earliest-starting
   * clip lands at the playhead; the rest preserve their *relative* offsets.
   * Returns the new clip IDs so the caller can re-select them.
   */
  pasteClips: () => readonly UUID[];

  // ── Effects ───────────────────────────────────────────────────────────────
  addEffect: (clipId: UUID, type: EffectType) => void;
  toggleEffect: (clipId: UUID, effectId: UUID) => void;
  updateEffect: (clipId: UUID, effectId: UUID, value: number) => void;
  removeEffect: (clipId: UUID, effectId: UUID) => void;

  // ── Remote ops (from Pusher) ──────────────────────────────────────────────
  // These mirror the user-facing mutations but DON'T call back to the API —
  // the server already has the canonical state (that's how the event got
  // here in the first place). Calling moveClip() / deleteClips() from a
  // Pusher handler would PATCH back to the server, which would re-broadcast
  // the same event, which would PATCH again, … = the infinite loop that
  // hit ERR_INSUFFICIENT_RESOURCES on every drag.
  applyRemoteClipUpsert: (clip: {
    id: UUID;
    track_id: UUID;
    asset_id: UUID | null;
    pos_ms: number;
    dur_ms: number;
    trim_in_ms?: number;
    name: string;
  }) => void;
  applyRemoteClipDelete: (clipId: UUID) => void;
}

const EFFECT_DEFAULTS: Record<EffectType, number> = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  blur: 0,
};

const MAX_UNDO = 50;

/** Snapshot the current state into the undo stack and clear the redo stack.
 *  Call this from every user-initiated mutation BEFORE applying the change.
 *  Hydration / undo / redo themselves never snapshot. */
function pushSnapshot(s: ProjectState): Pick<ProjectState, '_undoStack' | '_redoStack'> {
  const snap: ProjectSnapshot = {
    tracks: s.tracks,
    clips: s.clips,
    effects: s.effects,
  };
  return {
    _undoStack: [snap, ...s._undoStack].slice(0, MAX_UNDO),
    _redoStack: [],
  };
}

const VALID_ROLES = new Set<ProjectRole>(['owner', 'admin', 'editor', 'viewer']);

export const useProjectStore = create<ProjectState>()((set, get) => ({
  project: null,
  tracks: [],
  clips: [],
  effects: {},
  _undoStack: [],
  _redoStack: [],
  _clipboard: [],
  myRole: null,
  currentWorkspaceId: null,
  availableWorkspaces: [],
  availableProjects: [],

  setMyRole: (role) =>
    set({ myRole: role && VALID_ROLES.has(role as ProjectRole) ? (role as ProjectRole) : null }),

  refreshWorkspaces: async () => {
    const ws = await workspacesApi.list();
    const VALID_PLANS = new Set<WorkspacePlan>(['free', 'pro', 'team']);
    set({
      availableWorkspaces: ws.map((w) => ({
        id: w.id,
        name: w.name,
        role: (VALID_ROLES.has(w.role as ProjectRole) ? w.role : 'viewer') as ProjectRole,
        plan: (VALID_PLANS.has(w.plan as WorkspacePlan) ? w.plan : 'free') as WorkspacePlan,
      })),
    });
  },

  refreshProjects: async (workspaceId) => {
    const list = await projectsApi.list(workspaceId);
    set({
      availableProjects: list.items.map((p) => ({
        id: p.id,
        name: p.name,
        fps: p.fps,
        resolution: `${p.resolution_w}×${p.resolution_h}`,
      })),
    });
  },

  selectWorkspace: async (workspaceId) => {
    const s = get();
    const ws = s.availableWorkspaces.find((w) => w.id === workspaceId);
    if (!ws) return;
    set({ currentWorkspaceId: workspaceId, myRole: ws.role });
    await s.refreshProjects(workspaceId);
    const first = get().availableProjects[0];
    if (first) await s.loadProjectFromApi(first.id);
  },

  selectProject: async (projectId) => {
    await get().loadProjectFromApi(projectId);
  },

  createProject: async (workspaceId, name, fps = 30, resW = 1920, resH = 1080) => {
    const created = await projectsApi.create(workspaceId, {
      name,
      fps,
      resolution_w: resW,
      resolution_h: resH,
    });
    // Auto-create one video and one audio track so the editor isn't blank.
    await Promise.all([
      tracksApi.create(created.id, { name: 'Video 1', kind: 'video' }),
      tracksApi.create(created.id, { name: 'Audio 1', kind: 'audio' }),
    ]);
    await get().refreshProjects(workspaceId);
    await get().loadProjectFromApi(created.id);
  },

  updateProject: async ({ name, fps, resW, resH }) => {
    const projectId = get().project?.id;
    const wsId = get().currentWorkspaceId;
    if (!projectId) return;
    const updated = await projectsApi.update(projectId, {
      name,
      fps: fps !== undefined ? fps : undefined,
      resolution_w: resW,
      resolution_h: resH,
    });
    const resolution = `${updated.resolution_w}×${updated.resolution_h}`;
    set((s) => ({
      project: s.project
        ? { ...s.project, name: updated.name, fps: updated.fps, resolution }
        : null,
      availableProjects: s.availableProjects.map((p) =>
        p.id === projectId ? { ...p, name: updated.name, fps: updated.fps, resolution } : p,
      ),
    }));
    if (wsId) await get().refreshProjects(wsId);
  },

  createWorkspace: async (name) => {
    const ws = await workspacesApi.create(name);
    await get().refreshWorkspaces();
    // New workspace = caller is owner.
    set({ currentWorkspaceId: ws.id, myRole: 'owner', availableProjects: [] });
    // Auto-create a starter project so the editor has something to render.
    await get().createProject(ws.id, 'Untitled Project');
  },

  addTrack: async (kind, name) => {
    const projectId = get().project?.id;
    if (!projectId) return;
    await tracksApi.create(projectId, { name, kind });
    await get().loadProjectFromApi(projectId);
  },

  deleteTrack: async (trackId) => {
    // Optimistic: remove track + all its clips from local state immediately.
    set((s) => {
      const clipIds = new Set(s.clips.filter((c) => c.trackId === trackId).map((c) => c.id));
      const nextEffects = { ...s.effects };
      for (const id of clipIds) delete nextEffects[id];
      return {
        ...pushSnapshot(s),
        tracks: s.tracks.filter((t) => t.id !== trackId),
        clips: s.clips.filter((c) => c.trackId !== trackId),
        effects: nextEffects,
      };
    });
    try {
      await tracksApi.delete(trackId);
    } catch (e) {
      console.warn('deleteTrack persist failed — rolling back:', e);
      useProjectStore.getState().undoLocal();
    }
  },

  archiveProject: async (projectId) => {
    await projectsApi.archive(projectId);
    const wsId = get().currentWorkspaceId;
    if (!wsId) return;
    await get().refreshProjects(wsId);
    const next = get().availableProjects.find((p) => p.id !== projectId);
    if (next) {
      await get().loadProjectFromApi(next.id);
    } else {
      set({ project: null, tracks: [], clips: [], effects: {}, _undoStack: [], _redoStack: [] });
    }
  },

  canUndoLocal: () => get()._undoStack.length > 0,

  snapshotNow: () =>
    set((s) => ({
      ...pushSnapshot(s),
    })),

  undoLocal: () => {
    const s = get();
    const [top, ...rest] = s._undoStack;
    if (!top) return false;
    const current: ProjectSnapshot = {
      tracks: s.tracks,
      clips: s.clips,
      effects: s.effects,
    };
    set({
      tracks: top.tracks,
      clips: top.clips,
      effects: top.effects,
      _undoStack: rest,
      _redoStack: [current, ...s._redoStack].slice(0, MAX_UNDO),
    });
    return true;
  },

  redoLocal: () => {
    const s = get();
    const [top, ...rest] = s._redoStack;
    if (!top) return false;
    const current: ProjectSnapshot = {
      tracks: s.tracks,
      clips: s.clips,
      effects: s.effects,
    };
    set({
      tracks: top.tracks,
      clips: top.clips,
      effects: top.effects,
      _redoStack: rest,
      _undoStack: [current, ...s._undoStack].slice(0, MAX_UNDO),
    });
    return true;
  },

  loadMockProject: () =>
    set({
      project: MOCK_PROJECT,
      tracks: MOCK_TRACKS,
      clips: MOCK_CLIPS,
      effects: MOCK_EFFECTS,
      _undoStack: [],
      _redoStack: [],
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
      // Hydration resets the undo history — you can't undo back past a project load.
      _undoStack: [],
      _redoStack: [],
    });
  },

  toggleTrack: (trackId, key) =>
    set((s) => ({
      ...pushSnapshot(s),
      tracks: s.tracks.map((t) =>
        t.id === trackId ? { ...t, [key]: !t[key] } : t,
      ),
    })),

  addClip: ({ trackId, assetId, posMs, durMs, name, thumbs }) => {
    // Optimistic local insert with a temp id so the UI responds instantly.
    // Server returns the real UUID; we swap the temp id in-place once it lands.
    // pxToMs(...) returns floats; round so JSON serialises an integer and
    // the backend's `i64` deserialiser doesn't reject the payload with 422.
    const safePos = Math.max(0, Math.round(posMs));
    const safeDur = Math.max(400, Math.round(durMs));
    const tmpId = uid('c-tmp');
    set((s) => ({
      ...pushSnapshot(s),
      clips: [
        ...s.clips,
        {
          id: tmpId,
          trackId,
          assetId,
          name,
          posMs: safePos,
          durMs: safeDur,
          inPointMs: 0,
          outPointMs: safeDur,
          transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
          thumbs,
          version: 1,
        },
      ],
    }));

    // Persist — if this fails the clip stays in local state but won't reappear
    // after reload. Logging is enough; the toast system would be too noisy
    // for the fast drag-drop path.
    void timelineApi
      .addClip(trackId, {
        asset_id: assetId,
        pos_ms: safePos,
        dur_ms: safeDur,
        name,
      })
      .then((serverClip) => {
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id === tmpId ? { ...c, id: serverClip.id } : c,
          ),
        }));
      })
      .catch((e) => {
        console.warn('addClip persist failed:', e);
      });
    return tmpId;
  },

  moveClip: (clipId, newPosMs, newTrackId) => {
    const safePos = Math.max(0, Math.round(newPosMs));
    // No pushSnapshot here — caller must call snapshotNow() once at drag-start
    // (mousedown). Snapshotting on every mousemove would fill the undo stack
    // with intermediate positions and make Undo roll back only one frame.
    set((s) => ({
      clips: s.clips.map((c) =>
        c.id === clipId
          ? {
              ...c,
              posMs: safePos,
              trackId: newTrackId ?? c.trackId,
              version: c.version + 1,
            }
          : c,
      ),
    }));
    // Don't PATCH temp-id clips — addClip's promise will land first and
    // remap them; until then there's no server-side row to update.
    if (clipId.startsWith('c-tmp')) return;
    void timelineApi
      .updateClip(clipId, {
        pos_ms: safePos,
        ...(newTrackId ? { track_id: newTrackId } : {}),
      })
      .catch((e) => console.warn('moveClip persist failed:', e));
  },

  resizeClip: (clipId, newPosMs, newDurMs) => {
    const safePos = Math.max(0, Math.round(newPosMs));
    const safeDur = Math.max(400, Math.round(newDurMs));
    // No pushSnapshot here — same rationale as moveClip above.
    set((s) => ({
      clips: s.clips.map((c) =>
        c.id === clipId
          ? {
              ...c,
              posMs: safePos,
              durMs: safeDur,
              version: c.version + 1,
            }
          : c,
      ),
    }));
    if (clipId.startsWith('c-tmp')) return;
    void timelineApi
      .updateClip(clipId, {
        pos_ms: safePos,
        dur_ms: safeDur,
      })
      .catch((e) => console.warn('resizeClip persist failed:', e));
  },

  trimClip: (clipId, _side, newDurMs) => {
    const safeDur = Math.max(400, Math.round(newDurMs));
    set((s) => ({
      ...pushSnapshot(s),
      clips: s.clips.map((c) =>
        c.id === clipId
          ? { ...c, durMs: safeDur, version: c.version + 1 }
          : c,
      ),
    }));
  },

  splitClipAt: (clipId, atMs) => {
    const safeAt = Math.round(atMs);
    let rightTmpId: UUID | null = null;
    let splitLocalMs = 0; // distance from clip start to the split point

    set((s) => {
      const out: Clip[] = [];
      for (const c of s.clips) {
        const local = safeAt - c.posMs;
        // 400ms minimum on each half — matches the Postgres CHECK on
        // clips.dur_ms and the backend split guard. A 200ms guard here
        // would let the user split a 500ms clip into two 250ms halves
        // and only fail on the API roundtrip (with a "clips_dur_ms_check
        // violation" message), leaving the local state out of sync with
        // the database.
        if (c.id === clipId && local >= 400 && local <= c.durMs - 400) {
          const halfThumbs = c.thumbs ? c.thumbs.slice(Math.floor(c.thumbs.length / 2)) : undefined;
          out.push({ ...c, durMs: local, version: c.version + 1 });
          rightTmpId = uid('c-tmp');
          splitLocalMs = local;
          out.push({
            ...c,
            id: rightTmpId,
            posMs: safeAt,
            durMs: c.durMs - local,
            thumbs: halfThumbs,
            version: 1,
          });
        } else {
          out.push(c);
        }
      }
      return { ...pushSnapshot(s), clips: out };
    });

    // Persist: backend POST /clips/:id/split expects `split_at_ms` *relative*
    // to the clip's start (not absolute timeline position). It returns both
    // halves; the right half is brand new on the server so we swap our
    // optimistic temp id for its real UUID.
    if (clipId.startsWith('c-tmp') || !rightTmpId) return;
    const localRightTmpId: UUID = rightTmpId;
    void timelineApi
      .splitClip(clipId, splitLocalMs)
      .then((pair) => {
        const rightFromServer = pair.find((p) => p.pos_ms >= safeAt);
        if (!rightFromServer) return;
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id === localRightTmpId ? { ...c, id: rightFromServer.id } : c,
          ),
        }));
      })
      .catch((e) => {
        console.warn('splitClipAt persist failed — rolling back local split:', e);
        // Pop the snapshot we just pushed so the editor doesn't render two
        // half-clips that don't exist on the server. The user sees the
        // original whole clip again + a toast (added in CollabClient layer).
        useProjectStore.getState().undoLocal();
      });
  },

  deleteClips: (clipIds) => {
    // Only operate on clips that actually exist in current local state.
    // This prevents duplicate API calls when Del is pressed multiple times
    // (after the first press the clips are already gone from state — the
    // second press would otherwise still fire DELETEs for the same IDs).
    const drop = new Set(clipIds);
    let toDelete: UUID[] = [];

    set((s) => {
      if (drop.size === 0) return {};
      toDelete = s.clips.filter((c) => drop.has(c.id)).map((c) => c.id);
      if (toDelete.length === 0) return {};
      const nextEffects = { ...s.effects };
      for (const id of toDelete) delete nextEffects[id];
      return {
        ...pushSnapshot(s),
        clips: s.clips.filter((c) => !drop.has(c.id)),
        effects: nextEffects,
      };
    });

    // Clear selection immediately so pressing Del again doesn't re-target
    // the same (now-deleted) clip IDs.
    if (toDelete.length > 0) {
      useUIStore.getState().deselectAll();
    }

    // Fire-and-forget DELETEs — only for clips that existed locally.
    // Temp-id clips don't have a server row yet; skip them.
    for (const id of toDelete) {
      if (id.startsWith('c-tmp')) continue;
      void timelineApi
        .deleteClip(id)
        .catch((e) => console.warn(`deleteClip(${id}) persist failed:`, e));
    }
  },

  copyClips: (clipIds) => {
    const ids = new Set(clipIds);
    if (ids.size === 0) return;
    // Snapshot — store a deep-enough copy so subsequent edits to source clips
    // don't bleed into what the user later pastes. `Clip` already has only
    // primitive/JSON values plus a `transform` sub-object, so a shallow copy
    // of the array + spread of each clip is sufficient.
    const snapshot = get()
      .clips
      .filter((c) => ids.has(c.id))
      .map((c) => ({ ...c, transform: { ...c.transform } }));
    set({ _clipboard: snapshot });
  },

  pasteClips: () => {
    const clipboard = get()._clipboard;
    if (clipboard.length === 0) return [];

    // Anchor the earliest copied clip to the playhead so the *relative*
    // arrangement of multi-clip selections is preserved. Single clips
    // therefore paste exactly at the playhead.
    const playhead = usePlaybackStore.getState().currentTimeMs;
    const minPos = clipboard.reduce((m, c) => Math.min(m, c.posMs), Infinity);
    const offset = playhead - minPos;

    const newIds: UUID[] = [];
    for (const src of clipboard) {
      const newId = get().addClip({
        trackId: src.trackId,
        assetId: src.assetId,
        posMs: src.posMs + offset,
        durMs: src.durMs,
        name: src.name,
        thumbs: src.thumbs,
      });
      newIds.push(newId);
    }
    // Replace selection with the freshly-pasted clips so subsequent Del / drag
    // operates on the paste, not the original. (Mirrors Premiere / Resolve.)
    useUIStore.getState().setSelection(newIds);
    return newIds;
  },

  addEffect: (clipId, type) =>
    set((s) => {
      const meta = EFFECT_META[type];
      const value = EFFECT_DEFAULTS[type] ?? meta.min;
      const fx: ClipEffect = { id: uid('fx'), type, enabled: true, value };
      const existing = s.effects[clipId] ?? [];
      return {
        ...pushSnapshot(s),
        effects: { ...s.effects, [clipId]: [...existing, fx] },
      };
    }),

  toggleEffect: (clipId, effectId) =>
    set((s) => {
      const list = s.effects[clipId];
      if (!list) return {};
      return {
        ...pushSnapshot(s),
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
      // NB: slider drags fire updateEffect at 60fps. To keep the undo stack
      // useful (one entry per "interaction" rather than one per frame), we
      // skip the snapshot here. The trade-off: dragging a slider can't be
      // undone — but you can toggle the effect off instead.
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
        ...pushSnapshot(s),
        effects: { ...s.effects, [clipId]: list.filter((fx) => fx.id !== effectId) },
      };
    }),

  // ── Remote ops (no API roundtrip) ─────────────────────────────────────────

  applyRemoteClipUpsert: (clip) =>
    set((s) => {
      const existingIdx = s.clips.findIndex((c) => c.id === clip.id);
      const next: Clip = {
        id: clip.id,
        trackId: clip.track_id,
        assetId: clip.asset_id ?? '',
        name: clip.name,
        posMs: Math.max(0, clip.pos_ms),
        durMs: Math.max(400, clip.dur_ms),
        inPointMs: clip.trim_in_ms ?? 0,
        outPointMs: (clip.trim_in_ms ?? 0) + clip.dur_ms,
        transform: existingIdx >= 0
          ? s.clips[existingIdx]!.transform
          : { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
        thumbs: existingIdx >= 0 ? s.clips[existingIdx]!.thumbs : undefined,
        version: existingIdx >= 0 ? s.clips[existingIdx]!.version + 1 : 1,
      };
      const clips =
        existingIdx === -1
          ? [...s.clips, next]
          : s.clips.map((c, i) => (i === existingIdx ? next : c));
      return { clips };
    }),

  applyRemoteClipDelete: (clipId) =>
    set((s) => {
      if (!s.clips.some((c) => c.id === clipId)) return {};
      const nextEffects = { ...s.effects };
      delete nextEffects[clipId];
      return {
        clips: s.clips.filter((c) => c.id !== clipId),
        effects: nextEffects,
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

/** True when there's something to undo. Subscribe via `useProjectStore`. */
export const selectCanUndo = (s: ProjectState): boolean => s._undoStack.length > 0;
/** True when there's something to redo. Subscribe via `useProjectStore`. */
export const selectCanRedo = (s: ProjectState): boolean => s._redoStack.length > 0;

export const selectClipById = (id: UUID) => (s: ProjectState): Clip | undefined =>
  s.clips.find((c) => c.id === id);

// React's useSyncExternalStore (used by Zustand) requires the selector to
// return *stable* references when nothing changed — otherwise it re-renders
// on every snapshot check and throws "Maximum update depth exceeded".
// Share a single empty-array constant for the "no effects on this clip"
// fallback so the reference stays identical across renders.
const EMPTY_EFFECTS: readonly ClipEffect[] = Object.freeze([]);

export const selectEffectsForClip = (id: UUID) => (s: ProjectState): readonly ClipEffect[] =>
  s.effects[id] ?? EMPTY_EFFECTS;
