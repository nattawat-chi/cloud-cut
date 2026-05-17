/* =============================================================================
   CloudCut — domain types.
   These mirror the PostgreSQL schema defined in the test brief (§1) and the
   prototype's data.jsx. UUIDs are app-side UUIDv7 strings (sortable); the
   mocks use short ids ("c1", "tr_v1") and the same `UUID` alias keeps both
   shapes type-compatible.
   ============================================================================= */

export type UUID = string;

// ── Project / workspace ──────────────────────────────────────────────────────
export interface Project {
  readonly id: UUID;
  readonly name: string;
  readonly workspace: string;
  readonly fps: number;
  readonly resolution: string;       // e.g. "1920×1080"
  readonly durationMs: number;
}

// ── Tracks ──────────────────────────────────────────────────────────────────
export type TrackType = 'video' | 'audio';

export interface Track {
  readonly id: UUID;
  readonly type: TrackType;
  /** Human-readable label shown in the timeline header, e.g. "V1 · Main Cam". */
  readonly label: string;
  /** Short tag pill rendered next to the label, e.g. "V1". */
  readonly tag: string;
  /** Reference to a CSS custom property name in `index.css`. */
  readonly colorVar: '--clip-v-1' | '--clip-v-2' | '--clip-a-1' | '--clip-a-2';
  muted: boolean;
  locked: boolean;
  visible: boolean;
}

// ── Assets ──────────────────────────────────────────────────────────────────
export type AssetType = 'video' | 'audio' | 'image';
export type AssetStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export interface Asset {
  readonly id: UUID;
  readonly type: AssetType;
  readonly name: string;
  /** null for images; otherwise milliseconds. */
  readonly durMs: number | null;
  /** Pre-formatted human-readable size, e.g. "184 MB". */
  readonly size: string;
  status: AssetStatus;
  /** 0-100 — only meaningful while status is `uploading` or `processing`. */
  progress: number;
  /** CSS gradient string in mocks; URL in production. */
  thumb?: string;
}

// ── Clips ───────────────────────────────────────────────────────────────────
export interface ClipTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

export interface Clip {
  readonly id: UUID;
  trackId: UUID;
  readonly assetId: UUID;
  name: string;
  /** Position on the track, in milliseconds. */
  posMs: number;
  /** Visible duration, in milliseconds. */
  durMs: number;
  /** Source in-point — how far into the source asset playback starts. */
  inPointMs: number;
  /** Source out-point. `outPointMs - inPointMs == durMs` for ungraded clips. */
  outPointMs: number;
  transform: ClipTransform;
  /**
   * Pre-rendered thumbnail gradients (one per ~5s slot in the prototype).
   * Replaced by AssetVariant URLs once the backend is wired (Phase 3).
   */
  readonly thumbs?: readonly string[];
  /** Effect-type hint chips rendered as dots in the clip's bottom-left corner. */
  readonly fx?: readonly string[];
  /** Bumped on every successful mutation; used by optimistic-update reconcile. */
  version: number;
}

// ── Effects ─────────────────────────────────────────────────────────────────
export type EffectType = 'brightness' | 'contrast' | 'saturation' | 'blur';

export interface ClipEffect {
  readonly id: UUID;
  type: EffectType;
  enabled: boolean;
  /** Single scalar — the prototype's CSS-filter mapping (see player.jsx). */
  value: number;
}

/**
 * Metadata table for FX sliders — bounds + formatter live next to the
 * effect type so Inspector and CSS-filter renderer agree on units.
 */
export interface EffectMeta {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly fmt: (v: number) => string;
}

export const EFFECT_META: Readonly<Record<EffectType, EffectMeta>> = {
  brightness: { label: 'Brightness', min: -0.5, max: 0.5, step: 0.01, fmt: (v) => v.toFixed(2) },
  contrast:   { label: 'Contrast',   min: 0.5,  max: 2.0, step: 0.01, fmt: (v) => v.toFixed(2) },
  saturation: { label: 'Saturation', min: 0.0,  max: 2.0, step: 0.01, fmt: (v) => v.toFixed(2) },
  blur:       { label: 'Blur',       min: 0,    max: 20,  step: 0.5,  fmt: (v) => `${v.toFixed(1)}px` },
};

// ── Collaboration ───────────────────────────────────────────────────────────
export interface Collaborator {
  readonly id: UUID;
  readonly name: string;
  readonly initials: string;
  /** CSS color string — usually a `var(--collab-*)` reference. */
  readonly color: string;
}

export type CursorTarget = 'viewport' | 'timeline';

export interface CursorState {
  target: CursorTarget;
  /** Viewport target: ratios 0–1. Optional because timeline cursors don't use them. */
  x?: number;
  y?: number;
  /** Timeline target: position in ms along the timeline. */
  timelineMs?: number;
  visible: boolean;
  label: string;
  editingClipId: UUID | null;
}

// ── History ─────────────────────────────────────────────────────────────────
export type HistoryOpType =
  | 'clip.add'
  | 'clip.move'
  | 'clip.trim'
  | 'clip.split'
  | 'clip.delete'
  | 'effect.add'
  | 'effect.update'
  | 'effect.delete'
  | 'track.update'
  | 'text.update';

export interface HistoryEntry {
  readonly id: UUID;
  readonly type: HistoryOpType;
  readonly desc: string;
  readonly ts: string;        // "HH:MM:SS"
  readonly who: string;
  undone: boolean;
}

// ── Toasts ──────────────────────────────────────────────────────────────────
export interface Toast {
  readonly id: UUID;
  readonly who: string;
  readonly body: string;
  readonly t: number;          // Date.now()
}

// ── UI enums ────────────────────────────────────────────────────────────────
export type Tool = 'select' | 'blade' | 'hand';
export type ClipStyle = 'rich' | 'thumb' | 'wave' | 'flat';
export type Theme = 'dark' | 'light';
export type AssetTab = 'all' | 'video' | 'audio' | 'image';
export type InspectorTab = 'props' | 'effects' | 'audio';
export type TrackPreset = 'demo' | 'minimal' | 'audio-heavy';
