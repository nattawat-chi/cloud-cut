import type { Clip, ClipEffect } from '@/types';

/**
 * Pick the clip "on screen" at a given timecode.
 *
 * The prototype's compositing rule (player.jsx): if a V2 B-Roll clip
 * overlaps the V1 main cam at this time, V2 wins. Audio tracks are
 * deliberately ignored — they affect playback sound, not the visible frame.
 *
 * Pure function for unit testing (Phase 1.8).
 */
export function clipAtTime(
  clips: readonly Clip[],
  ms: number,
): Clip | undefined {
  const v2 = clips.find(
    (c) => c.trackId === 'tr_v2' && ms >= c.posMs && ms < c.posMs + c.durMs,
  );
  if (v2) return v2;
  return clips.find(
    (c) => c.trackId === 'tr_v1' && ms >= c.posMs && ms < c.posMs + c.durMs,
  );
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
