import { useEffect, useRef, useState } from 'react';

import { RemoteCursors } from '@/collaboration/RemoteCursors';
import { useViewportCursorBroadcast } from '@/collaboration/useViewportCursorBroadcast';
import { PanelHead } from '@/components/shared/PanelHead';
import { useAudioMixer } from '@/hooks/useAudioMixer';
import { usePlaybackTicker } from '@/hooks/usePlaybackTicker';
import { useAssetsStore } from '@/state/assetsStore';
import { usePlaybackStore } from '@/state/playbackStore';
import { useProjectStore } from '@/state/projectStore';
import { clipAtTime, filterFromEffects } from '@/utils/playback';
import { fmtTC } from '@/utils/timecode';

import { MockFrame } from './MockFrame';
import { PlayerControls } from './PlayerControls';

/**
 * 16:9 stage with overlays + transport.
 *
 * - Looks up the visible clip via `clipAtTime` (V2 over V1, hidden tracks skipped).
 * - When the underlying asset has a `proxyUrl` (worker generated proxy.mp4),
 *   renders a real `<video>` element synced to `playbackStore.currentTimeMs`.
 *   Otherwise falls back to `MockFrame` so the editor still shows *something*
 *   while the worker is processing an upload.
 * - CSS filters from enabled effects are applied to the stage div so they
 *   apply equally to real video and the mock composition.
 */
export function VideoPlayer() {
  usePlaybackTicker(); // drives currentTimeMs via RAF when isPlaying
  useAudioMixer();    // drives hidden <audio> elements for audio-track clips
  const cursorHandlers = useViewportCursorBroadcast();

  const clips = useProjectStore((s) => s.clips);
  const tracks = useProjectStore((s) => s.tracks);
  const effectsMap = useProjectStore((s) => s.effects);
  const project = useProjectStore((s) => s.project);
  const currentTimeMs = usePlaybackStore((s) => s.currentTimeMs);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const volume = usePlaybackStore((s) => s.volume);
  const isMuted = usePlaybackStore((s) => s.isMuted);

  const assetsById = useAssetsStore((s) => s.byId);

  const clip = clipAtTime(clips, tracks, currentTimeMs);
  const asset = clip ? assetsById[clip.assetId] : undefined;
  const proxyUrl = asset?.proxyUrl;
  const effects = clip ? effectsMap[clip.id] ?? [] : [];
  const cssFilter = filterFromEffects(effects);

  // ─── <video> sync ──────────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Falls back to MockFrame when the proxy can't be loaded (e.g. seeded assets
  // whose proxy.mp4 files don't yet exist in MinIO, or a transient network
  // error). Cleared whenever the source URL changes so a different clip gets
  // a fresh attempt.
  const [videoError, setVideoError] = useState(false);

  // Reload the element when the source URL changes (clip flip)
  useEffect(() => {
    setVideoError(false);
    const v = videoRef.current;
    if (!v || !proxyUrl) return;
    if (v.src !== proxyUrl) v.load();
  }, [proxyUrl]);

  // Seek the underlying source when the timeline scrubs.
  // We only force a seek when drift exceeds 250ms to avoid fighting the native
  // playback clock while `isPlaying` (which would stutter).
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !clip) return;
    // Convert timeline time → source time:
    //   delta inside the clip + the clip's in-point offset into the source
    const clipLocalMs = currentTimeMs - clip.posMs + (clip.inPointMs ?? 0);
    const targetSec = Math.max(0, clipLocalMs / 1000);
    if (Math.abs(v.currentTime - targetSec) > 0.25) {
      v.currentTime = targetSec;
    }
  }, [currentTimeMs, clip]);

  // Play / pause sync — driven by the playback store rather than DOM controls.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) {
      // play() returns a Promise; the first user-gesture call may reject if the
      // browser autoplay policy hasn't unblocked yet. Failing silently is fine
      // because the UI ticker keeps advancing currentTimeMs either way.
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [isPlaying, proxyUrl]);

  // Volume / mute
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = Math.max(0, Math.min(1, volume));
    v.muted = isMuted;
  }, [volume, isMuted]);

  return (
    <div
      className="relative flex h-full min-h-0 flex-col bg-surface-0"
      onMouseMove={cursorHandlers.onMouseMove}
      onMouseLeave={cursorHandlers.onMouseLeave}
    >
      <RemoteCursors />
      <PanelHead
        title="Preview"
        tools={
          clip && (
            <span className="font-mono text-[10px] text-text-3">{clip.name}</span>
          )
        }
      />

      <div className="relative grid min-h-0 flex-1 place-items-center overflow-hidden p-6">
        <div
          className="relative aspect-video w-full max-h-full max-w-full overflow-hidden rounded-sm bg-black"
          style={{
            filter: cssFilter,
            transition: 'filter 0.15s',
            boxShadow: '0 14px 50px -20px rgba(0,0,0,0.7), 0 0 0 1px var(--line)',
          }}
        >
          {proxyUrl && !videoError ? (
            <video
              ref={videoRef}
              src={proxyUrl}
              className="absolute inset-0 h-full w-full object-contain"
              playsInline
              preload="auto"
              onError={(e) => {
                // Log the failure and fall back to MockFrame. Common causes:
                // proxy.mp4 not yet in MinIO (seeded/processing assets),
                // MinIO 404 returns S3 XML which the media engine rejects as
                // code=4 (SRC_NOT_SUPPORTED), transient network errors.
                const v = e.currentTarget;
                const code = v.error?.code;
                const msg = v.error?.message ?? 'unknown';
                // eslint-disable-next-line no-console
                console.warn(
                  `<video> failed to load (code=${code}, msg="${msg}") src=${proxyUrl} — falling back to MockFrame`,
                );
                setVideoError(true);
              }}
            />
          ) : (
            <>
              <MockFrame clip={clip} />
              {clip && asset && !asset.proxyUrl && (
                <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                  <span
                    className="rounded-full px-2.5 py-1 text-[10px] font-medium text-white/80"
                    style={{ background: 'rgba(0,0,0,0.55)' }}
                  >
                    {asset.status === 'processing' || asset.status === 'uploading'
                      ? 'Processing… preview unavailable'
                      : 'Preview unavailable'}
                  </span>
                </div>
              )}
            </>
          )}

          {/* Safe area guide */}
          <div
            className="pointer-events-none absolute rounded-sm"
            style={{ inset: '4%', border: '1px dashed rgba(255,255,255,0.12)' }}
          />

          {/* Top-left timecode overlay */}
          <div
            className="font-mono absolute left-3 top-3 rounded-sm px-2 py-1 text-[11px] text-white"
            style={{ background: 'rgba(0,0,0,0.55)', letterSpacing: '0.04em' }}
          >
            {fmtTC(currentTimeMs, project?.fps ?? 30)}
          </div>

          {/* Top-right resolution + fps */}
          {project && (
            <div
              className="font-mono absolute right-3 top-3 rounded-sm px-2 py-1 text-[10px]"
              style={{
                background: 'rgba(0,0,0,0.55)',
                color: 'rgba(255,255,255,0.7)',
                letterSpacing: '0.04em',
              }}
            >
              {project.resolution} · {project.fps}fps
            </div>
          )}
        </div>
      </div>

      <PlayerControls />
    </div>
  );
}
