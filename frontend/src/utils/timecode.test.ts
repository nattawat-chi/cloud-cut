import { describe, expect, it } from 'vitest';

import { fmtClipDur, fmtRulerTick, fmtTC, pickRulerStep } from './timecode';

describe('fmtTC', () => {
  it('renders 0 ms as 00:00:00:00', () => {
    expect(fmtTC(0)).toBe('00:00:00:00');
  });

  it('renders 1 second exactly', () => {
    expect(fmtTC(1000)).toBe('00:00:01:00');
  });

  it('computes frames at 30 fps', () => {
    // 500 ms = 15 frames at 30 fps
    expect(fmtTC(500, 30)).toBe('00:00:00:15');
  });

  it('handles hours, minutes, seconds + remaining frames', () => {
    // 1h 1m 1s + 15 frames at 30 fps
    expect(fmtTC(3_661_500, 30)).toBe('01:01:01:15');
  });

  it('clamps negative input to zero', () => {
    expect(fmtTC(-1000)).toBe('00:00:00:00');
  });

  it('respects custom fps', () => {
    // 200 ms = 4 frames at 24 fps (24/1000 * 200 = 4.8 -> floor 4)
    expect(fmtTC(200, 24)).toBe('00:00:00:04');
  });
});

describe('fmtClipDur', () => {
  it('uses 1-decimal seconds under 60s', () => {
    expect(fmtClipDur(500)).toBe('0.5s');
    expect(fmtClipDur(12_500)).toBe('12.5s');
  });

  it('switches to m:ss past 60s', () => {
    expect(fmtClipDur(60_000)).toBe('1:00');
    expect(fmtClipDur(94_000)).toBe('1:34');
  });

  it('renders 0 ms as 0.0s', () => {
    expect(fmtClipDur(0)).toBe('0.0s');
  });
});

describe('pickRulerStep', () => {
  it('picks the smallest step that yields >= minPx between major ticks', () => {
    // At 200 px/s, 0.5s * 200 = 100px > 60px → returns 0.5
    expect(pickRulerStep(200)).toBe(0.5);
    // At 100 px/s, 0.5s * 100 = 50px < 60 → next: 1s * 100 = 100px > 60
    expect(pickRulerStep(100)).toBe(1);
    // At 20 px/s: 0.5*20=10, 1*20=20, 2*20=40, 5*20=100 → 5
    expect(pickRulerStep(20)).toBe(5);
  });

  it('falls back to the largest step at very low zoom', () => {
    // 0.5px/s — no step gets to 60px in our table; falls back to 60s
    expect(pickRulerStep(0.5)).toBe(60);
  });
});

describe('fmtRulerTick', () => {
  it('shows seconds under 1 minute', () => {
    expect(fmtRulerTick(0)).toBe('0s');
    expect(fmtRulerTick(5)).toBe('5s');
    expect(fmtRulerTick(0.5)).toBe('0.5s');
  });

  it('shows m:ss at and beyond 60s', () => {
    expect(fmtRulerTick(60)).toBe('1:00');
    expect(fmtRulerTick(125)).toBe('2:05');
  });
});
