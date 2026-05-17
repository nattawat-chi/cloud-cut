import { describe, expect, it } from 'vitest';

import type { Clip, ClipEffect } from '@/types';

import { clipAtTime, filterFromEffects } from './playback';

function makeClip(overrides: Partial<Clip> & Pick<Clip, 'id' | 'trackId' | 'posMs' | 'durMs'>): Clip {
  return {
    assetId: 'a_x',
    name: 'sample.mp4',
    inPointMs: 0,
    outPointMs: overrides.durMs,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    version: 1,
    ...overrides,
  } as Clip;
}

describe('clipAtTime', () => {
  const v1a = makeClip({ id: 'v1a', trackId: 'tr_v1', posMs: 0,    durMs: 5000 });
  const v1b = makeClip({ id: 'v1b', trackId: 'tr_v1', posMs: 5000, durMs: 5000 });
  const v2  = makeClip({ id: 'v2',  trackId: 'tr_v2', posMs: 2000, durMs: 2000 });
  const a1  = makeClip({ id: 'a1',  trackId: 'tr_a1', posMs: 0,    durMs: 10_000 });

  it('returns the V1 clip when no V2 overlaps', () => {
    expect(clipAtTime([v1a, v1b, a1], 1000)?.id).toBe('v1a');
    expect(clipAtTime([v1a, v1b, a1], 5500)?.id).toBe('v1b');
  });

  it('lets V2 win over V1 during overlap', () => {
    // ms=2500: V2 covers 2000-4000 → wins over V1 at 0-5000
    expect(clipAtTime([v1a, v2, a1], 2500)?.id).toBe('v2');
  });

  it('ignores audio tracks (visible-frame query)', () => {
    expect(clipAtTime([a1], 1000)).toBeUndefined();
  });

  it('returns undefined for times past all clips', () => {
    expect(clipAtTime([v1a, v1b], 999_999)).toBeUndefined();
  });

  it('treats the clip end as exclusive', () => {
    // V1 ends at 5000, V1b starts at 5000 — the later clip should win at 5000
    expect(clipAtTime([v1a, v1b], 5000)?.id).toBe('v1b');
  });
});

describe('filterFromEffects', () => {
  const fx = (type: ClipEffect['type'], value: number, enabled = true): ClipEffect => ({
    id: 'fx_' + type,
    type,
    enabled,
    value,
  });

  it('returns the identity filter for an empty list', () => {
    expect(filterFromEffects([])).toBe('brightness(1) contrast(1) saturate(1) blur(0px)');
  });

  it('maps brightness as 1 + value (slider centers at 0)', () => {
    expect(filterFromEffects([fx('brightness', 0.2)])).toContain('brightness(1.2)');
  });

  it('uses the value directly for contrast / saturate', () => {
    const out = filterFromEffects([fx('contrast', 1.4), fx('saturation', 1.6)]);
    expect(out).toContain('contrast(1.4)');
    expect(out).toContain('saturate(1.6)');
  });

  it('appends px to blur', () => {
    expect(filterFromEffects([fx('blur', 3)])).toContain('blur(3px)');
  });

  it('skips disabled effects', () => {
    const out = filterFromEffects([fx('contrast', 1.5, false)]);
    expect(out).toContain('contrast(1)');
  });

  it('composes multiple enabled effects into a single string', () => {
    const out = filterFromEffects([
      fx('brightness', 0.1),
      fx('contrast', 1.2),
      fx('saturation', 0.8),
      fx('blur', 2),
    ]);
    expect(out).toBe('brightness(1.1) contrast(1.2) saturate(0.8) blur(2px)');
  });
});
