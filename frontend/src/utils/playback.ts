import type { Clip, ClipEffect, Track } from '@/types';

/**
 * Pick the clip "on screen" at a given timecode.
 *
 * Rules:
 *   - Only video tracks contribute to the visible frame (audio is ignored).
 *   - Tracks later in the `tracks` array composite **on top** — matches the
 *     prototype convention where V2 overlays V1.
 *   - Tracks with `visible === false` are skipped entirely (eye-icon toggle).
 *   - First overlapping clip on the topmost visible track wins.
 *
 * Pure function for unit testing (Phase 1.8).
 */
export function clipAtTime(
  clips: readonly Clip[],
  tracks: readonly Track[],
  ms: number,
): Clip | undefined {
  const videoTracks = tracks.filter((t) => t.type === 'video' && t.visible !== false);
  // Walk from top track down so the highest layer wins on overlap.
  for (let i = videoTracks.length - 1; i >= 0; i--) {
    const tr = videoTracks[i]!;
    const clip = clips.find(
      (c) => c.trackId === tr.id && ms >= c.posMs && ms < c.posMs + c.durMs,
    );
    if (clip) return clip;
  }
  return undefined;
}

/**
 * Compose a CSS `filter:` string from a clip's enabled effects.
 * Defaults are identity (brightness 1, contrast 1, saturate 1, blur 0) so the
 * stage stays neutral when no effects are enabled.
 *
 * Note: brightness uses `1 + value` because the prototype's UI slider centers
 * at zero (negative darkens, positive brightens); CSS filter takes a positive
 * scalar where 1 is identity.
 */
export function filterFromEffects(effects: readonly ClipEffect[]): string {
  let brightness = 1;
  let contrast = 1;
  let saturation = 1;
  let blur = 0;

  for (const fx of effects) {
    if (!fx.enabled) continue;
    switch (fx.type) {
      case 'brightness': brightness = 1 + fx.value; break;
      case 'contrast':   contrast = fx.value;       break;
      case 'saturation': saturation = fx.value;     break;
      case 'blur':       blur = fx.value;           break;
    }
  }

  return `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) blur(${blur}px)`;
}
