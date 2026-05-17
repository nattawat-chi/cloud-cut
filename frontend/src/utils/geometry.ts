/**
 * Timeline geometry — pure functions that convert between time and pixels.
 *
 * The whole timeline (ruler, clips, playhead, drag math, snap, viewport
 * culling) reduces to one scalar: `zoomLevel` (the Tweaks slider value, 0.3–4)
 * which maps to `pxPerSec`. Concentrating the math here makes the Timeline
 * implementation trivial and the Vitest suite (Phase 1.8) deterministic.
 */
import type { Clip } from '@/types';

/**
 * Anchor: zoom = 1.0 → 50 px/s (matches the prototype default in styles.css).
 * `Math.max(15, …)` and `Math.min(200, …)` guard against degenerate clips
 * at extreme zoom levels.
 */
export const PX_PER_SEC_AT_ZOOM_1 = 50;
export const MIN_PX_PER_SEC = 15;
export const MAX_PX_PER_SEC = 200;

export function pxPerSec(zoomLevel: number): number {
  const raw = zoomLevel * PX_PER_SEC_AT_ZOOM_1;
  return Math.max(MIN_PX_PER_SEC, Math.min(MAX_PX_PER_SEC, raw));
}

export function pxPerMs(zoomLevel: number): number {
  return pxPerSec(zoomLevel) / 1000;
}

export function msToPx(ms: number, zoomLevel: number): number {
  return ms * pxPerMs(zoomLevel);
}

export function pxToMs(px: number, zoomLevel: number): number {
  return px / pxPerMs(zoomLevel);
}

/**
 * Pixel layout for a single clip on the track.
 * `left` + `width` are in pixels relative to the inner timeline content.
 */
export interface ClipBox {
  left: number;
  width: number;
}

export function clipBox(clip: Pick<Clip, 'posMs' | 'durMs'>, zoomLevel: number): ClipBox {
  const pms = pxPerMs(zoomLevel);
  return { left: clip.posMs * pms, width: clip.durMs * pms };
}

/**
 * Snap-target picker. Given a candidate position (`posMs`) and a list of
 * snap points (other-clip edges, playhead, t=0), return the snapped position
 * if any candidate is within `thresholdPx` of either the clip's start or end.
 *
 * Returns `{ posMs: original, snappedTo: null }` when no candidate is close
 * enough. The first match wins (clip edges sort closest-first in practice
 * because the dragger filters them by hint).
 */
export interface SnapResult {
  posMs: number;
  snappedTo: number | null;
}

export function snap(
  posMs: number,
  durMs: number,
  candidates: readonly number[],
  zoomLevel: number,
  thresholdPx: number = 14,
): SnapResult {
  const thresholdMs = thresholdPx / pxPerMs(zoomLevel);
  for (const t of candidates) {
    if (Math.abs(posMs - t) <= thresholdMs) {
      return { posMs: t, snappedTo: t };
    }
    if (Math.abs(posMs + durMs - t) <= thresholdMs) {
      return { posMs: t - durMs, snappedTo: t };
    }
  }
  return { posMs, snappedTo: null };
}
