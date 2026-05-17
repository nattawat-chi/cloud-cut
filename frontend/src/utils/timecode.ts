/**
 * Time formatting helpers — exercised by the Vitest suite in Phase 1.8.
 * Pure functions: no React, no globals, easy to unit-test.
 */

const DEFAULT_FPS = 30;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/**
 * Render a millisecond duration as a broadcast-style timecode `HH:MM:SS:FF`.
 * Negative inputs clamp to zero (timeline can briefly compute negative on drag).
 */
export function fmtTC(ms: number, fps: number = DEFAULT_FPS): string {
  const total = Math.max(0, Math.round(ms));
  const sTotal = Math.floor(total / 1000);
  const h = Math.floor(sTotal / 3600);
  const m = Math.floor((sTotal % 3600) / 60);
  const s = sTotal % 60;
  // Integer-math form avoids the floating-point error at exact frame
  // boundaries (e.g. 500ms / 30fps was returning 14 instead of 15 because
  // `500 / (1000 / 30)` evaluates to 14.999999…).
  const f = Math.min(fps - 1, Math.floor(((total % 1000) * fps) / 1000));
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
}

/**
 * Compact duration label for asset rows + clip stamps:
 *   "0.3s"  for sub-second clips
 *   "12.5s" for short clips
 *   "1:34"  for longer clips
 */
export function fmtClipDur(ms: number): string {
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${pad(s)}`;
}

/**
 * Pick the next major-tick interval (in seconds) given pixel scale.
 * Walks a coarse-to-fine series and returns the first that yields ≥ minPx
 * between ticks. Used by the timeline ruler.
 */
export function pickRulerStep(pxPerSec: number, minPx: number = 60): number {
  const STEPS = [0.5, 1, 2, 5, 10, 30, 60];
  for (const s of STEPS) {
    if (s * pxPerSec >= minPx) return s;
  }
  return STEPS[STEPS.length - 1] ?? 60;
}

/** Short label for the ruler — drops sub-minute precision once we cross 1m. */
export function fmtRulerTick(sec: number): string {
  if (sec < 60) {
    return sec < 1 && sec > 0 ? `${sec.toFixed(1)}s` : `${Math.round(sec)}s`;
  }
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${pad(s)}`;
}
