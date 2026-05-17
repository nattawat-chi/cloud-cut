import { describe, expect, it } from 'vitest';

import {
  clipBox,
  msToPx,
  PX_PER_SEC_AT_ZOOM_1,
  pxPerMs,
  pxPerSec,
  pxToMs,
  snap,
} from './geometry';

describe('pxPerSec / pxPerMs', () => {
  it('returns the anchor px/s at zoom 1.0', () => {
    expect(pxPerSec(1)).toBe(PX_PER_SEC_AT_ZOOM_1);
    expect(pxPerMs(1)).toBeCloseTo(PX_PER_SEC_AT_ZOOM_1 / 1000);
  });

  it('clamps below MIN', () => {
    // anything below 15/PX_PER_SEC_AT_ZOOM_1 ≈ 0.3 gets clamped
    expect(pxPerSec(0.01)).toBeGreaterThanOrEqual(15);
  });

  it('clamps above MAX', () => {
    expect(pxPerSec(99)).toBeLessThanOrEqual(200);
  });
});

describe('msToPx / pxToMs', () => {
  it('round-trips a millisecond value through px and back', () => {
    const zoom = 1.5;
    const ms = 12_345;
    const px = msToPx(ms, zoom);
    expect(pxToMs(px, zoom)).toBeCloseTo(ms);
  });

  it('zero ms maps to zero px', () => {
    expect(msToPx(0, 2)).toBe(0);
  });
});

describe('clipBox', () => {
  it('computes left and width from clip position + duration', () => {
    const box = clipBox({ posMs: 2000, durMs: 4000 }, 1);
    // at zoom 1.0 → 50 px/s → 0.05 px/ms
    expect(box.left).toBeCloseTo(100);
    expect(box.width).toBeCloseTo(200);
  });
});

describe('snap', () => {
  // At zoom 1.0 → 50 px/s → 0.05 px/ms.
  // Default threshold 14px ≈ 280 ms in project time.

  it('returns the input untouched when no candidate is within threshold', () => {
    const r = snap(1000, 5000, [10_000, 20_000], 1.0);
    expect(r.posMs).toBe(1000);
    expect(r.snappedTo).toBeNull();
  });

  it('snaps the start edge to a nearby candidate', () => {
    // posMs 1100 is 100ms from candidate 1000 → well inside 280ms threshold
    const r = snap(1100, 5000, [1000], 1.0);
    expect(r.posMs).toBe(1000);
    expect(r.snappedTo).toBe(1000);
  });

  it('snaps the end edge to a candidate (pins right edge)', () => {
    // clip end at 900+5000 = 5900; candidate 6000 within threshold
    // snap math: newPos = candidate - durMs = 6000 - 5000 = 1000
    const r = snap(900, 5000, [6000], 1.0);
    expect(r.posMs).toBe(1000);
    expect(r.snappedTo).toBe(6000);
  });

  it('prefers the first matching candidate (start-edge match wins over end-edge)', () => {
    // Both could match if both are in range, but start-edge is checked first.
    const r = snap(1100, 5000, [1000, 6000], 1.0);
    expect(r.snappedTo).toBe(1000);
  });

  it('respects an empty candidate list', () => {
    const r = snap(2500, 1000, [], 1.0);
    expect(r.posMs).toBe(2500);
    expect(r.snappedTo).toBeNull();
  });

  it('honours a tighter threshold at higher zoom', () => {
    // At zoom 4 → 200 px/s → 0.2 px/ms → 14px ≈ 70ms threshold.
    // 1100 is 100ms from 1000 → outside the tighter threshold.
    const r = snap(1100, 5000, [1000], 4);
    expect(r.snappedTo).toBeNull();
  });
});
