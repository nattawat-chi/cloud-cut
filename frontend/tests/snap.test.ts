import { describe, expect, it } from 'vitest';

import { snap } from '../src/utils/geometry';

describe('snap utility', () => {
  it('returns position unchanged when no edges are close', () => {
    expect(snap(500, [0, 1000], 100)).toBe(500);
  });

  it('snaps to nearest edge within threshold', () => {
    expect(snap(195, [0, 200, 400], 10)).toBe(200);
  });

  it('snaps to timeline start (0)', () => {
    expect(snap(5, [0], 10)).toBe(0);
  });

  it('prefers the closer edge when two are within threshold', () => {
    expect(snap(198, [190, 205], 15)).toBe(190);
  });
});
