import { describe, expect, it } from 'vitest';

import { waveformPath } from './waveform';

describe('waveformPath', () => {
  it('is deterministic for the same id + dimensions', () => {
    const a = waveformPath('c1', false, 200, 40);
    const b = waveformPath('c1', false, 200, 40);
    expect(a).toBe(b);
  });

  it('changes when the clip id changes', () => {
    const a = waveformPath('c1', false, 200, 40);
    const b = waveformPath('c2', false, 200, 40);
    expect(a).not.toBe(b);
  });

  it('emits one move+line pair per bar (~ width/3, clamped 40..220)', () => {
    const path = waveformPath('c1', false, 300, 40);
    const segs = path.split(' M').length;
    // 300 / 3 = 100 bars — well within the clamp range.
    expect(segs).toBe(100);
  });

  it('caps the number of bars at the upper bound', () => {
    const path = waveformPath('c1', false, 10_000, 40);
    expect(path.split(' M').length).toBe(220);
  });

  it('produces shorter paths for very narrow clips', () => {
    const path = waveformPath('c1', false, 20, 40);
    expect(path.split(' M').length).toBe(40); // hits lower-bound clamp
  });

  it('produces a valid SVG path string', () => {
    const path = waveformPath('c1', true, 200, 40);
    // Every segment is "M x y L x y" — verifying the first segment shape.
    expect(path).toMatch(/^M[\d.]+ [\d.]+ L[\d.]+ [\d.]+/);
  });
});
