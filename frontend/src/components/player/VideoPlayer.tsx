import { ViewportCursors } from '@/components/collaboration/ViewportCursors';
import { PanelHead } from '@/components/shared/PanelHead';
import { usePlaybackTicker } from '@/hooks/usePlaybackTicker';
import { usePlaybackStore } from '@/state/playbackStore';
import { useProjectStore } from '@/state/projectStore';
import { clipAtTime, filterFromEffects } from '@/utils/playback';
import { fmtTC } from '@/utils/timecode';

import { MockFrame } from './MockFrame';
import { PlayerControls } from './PlayerControls';

/**
 * 16:9 stage with overlays + transport. Effects from `projectStore.effects`
 * are composed into a single CSS `filter` string and applied to the stage,
 * so dragging an Inspector slider updates the preview frame in real time.
 */
export function VideoPlayer() {
  usePlaybackTicker(); // mount-only — drives currentTimeMs when isPlaying.

  const clips = useProjectStore((s) => s.clips);
  const tracks = useProjectStore((s) => s.tracks);
  const effectsMap = useProjectStore((s) => s.effects);
  const project = useProjectStore((s) => s.project);
  const currentTimeMs = usePlaybackStore((s) => s.currentTimeMs);

  const clip = clipAtTime(clips, tracks, currentTimeMs);
  const effects = clip ? effectsMap[clip.id] ?? [] : [];
  const cssFilter = filterFromEffects(effects);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-surface-0">
      <ViewportCursors />
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
          <MockFrame clip={clip} />

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
