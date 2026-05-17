/**
 * Deterministic waveform-path generator for audio clips.
 *
 * Real audio peaks come from the worker's `ExtractWaveform` pipeline (Phase 4)
 * and ship as a peaks array in `AssetVariant`. Until then, we hash the clip
 * id and render ~120 vertical bars with sin-based pseudo-random heights —
 * looks like a waveform, stays stable across re-renders, no measurement cost.
 *
 * Music vs voice-over use different envelopes: music swells in the middle
 * (where the bed peaks), VO is flatter with sharper transients.
 */

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return Math.abs(h);
}

/**
 * SVG `d` attribute string for a waveform inside a `width × height` viewBox.
 * The bars are vertical line segments centered on the midline.
 */
export function waveformPath(
  clipId: string,
  isMusic: boolean,
  width: number,
  height: number,
): string {
  const seed = hashStr(clipId);
  // One bar every ~3px keeps the silhouette readable at any zoom but
  // caps to 220 to stay cheap during drag.
  const bars = Math.max(40, Math.min(220, Math.floor(width / 3)));
  const rand = (i: number): number => {
    const x = Math.sin(seed * 0.013 + i * 0.37) * 10000;
    return x - Math.floor(x);
  };

  const parts: string[] = [];
  const half = height / 2;
  for (let i = 0; i < bars; i++) {
    const t = i / bars;
    const env = isMusic
      ? 0.85 - Math.abs(t - 0.5) * 0.2
      : Math.min(1, 0.4 + rand(i * 3) * 0.9);
    const peak = rand(i) * env;
    const dip = -rand(i + 2) * env;
    const x = (i + 0.5) * (width / bars);
    const y1 = half - peak * (half - 1);
    const y2 = half - dip * (half - 1);
    parts.push(`M${x.toFixed(1)} ${y1.toFixed(1)} L${x.toFixed(1)} ${y2.toFixed(1)}`);
  }
  return parts.join(' ');
}
