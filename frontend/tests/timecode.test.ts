import { describe, expect, it } from 'vitest';

import { fmtTC, msToFrames, framesToMs } from '../src/utils/timecode';

describe('timecode utilities', () => {
  it('formats zero as 00:00:00:00', () => {
    expect(fmtTC(0)).toBe('00:00:00:00');
  });

  it('formats 1 minute 30 seconds at 30fps', () => {
    expect(fmtTC(90_000, 30)).toBe('00:01:30:00');
  });

  it('round-trips ms → frames → ms', () => {
    const ms = 12_345;
    expect(framesToMs(msToFrames(ms, 30), 30)).toBeCloseTo(ms, 0);
  });
});
