import { useCallback, useMemo, useRef, useState } from 'react';

import { MOCK_ASSET_INDEX } from '@/mocks/cloudcut';
import { useCollabStore } from '@/state/collabStore';
import { useHistoryStore } from '@/state/historyStore';
import { usePlaybackStore } from '@/state/playbackStore';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import type { Clip, Track } from '@/types';
import { msToPx, pxPerSec, pxToMs, snap as snapMath } from '@/utils/geometry';

import { Playhead } from './Playhead';
import { TimelineClip } from './TimelineClip';
import { TimelineRuler } from './TimelineRuler';
import { TimelineToolbar } from './TimelineToolbar';
import { TrackHeader } from './TrackHeader';

const SNAP_THRESHOLD_PX = 14;

/**
 * Timeline editor — composition + interaction layer.
 *
 * Drag handlers (clip body + trim handles) live inline because they need to
 * coordinate with `snapLineX` local state. Hoisting them into a custom hook
 * would force exposing a setter; keeping them here is shorter and clearer.
 */
export function Timeline() {
  const tracks = useProjectStore((s) => s.tracks);
  const clips = useProjectStore((s) => s.clips);
  const project = useProjectStore((s) => s.project);
  const moveClip = useProjectStore((s) => s.moveClip);
  const resizeClip = useProjectStore((s) => s.resizeClip);
  const splitClipAt = useProjectStore((s) => s.splitClipAt);
  const addClip = useProjectStore((s) => s.addClip);

  const visibleTrackIds = useUIStore((s) => s.visibleTrackIds);
  const selectedIds = useUIStore((s) => s.selectedClipIds);
  const selectClip = useUIStore((s) => s.selectClip);
  const zoomLevel = useUIStore((s) => s.zoomLevel);
  const snapEnabled = useUIStore((s) => s.snapEnabled);
  const activeTool = useUIStore((s) => s.activeTool);
  const clipStyle = useUIStore((s) => s.clipStyle);
  const showPresence = useUIStore((s) => s.showPresence);

  const currentTimeMs = usePlaybackStore((s) => s.currentTimeMs);
  const seek = usePlaybackStore((s) => s.seek);

  const cursors = useCollabStore((s) => s.cursors);
  const collaborators = useCollabStore((s) => s.collaborators);

  const pushHistory = useHistoryStore((s) => s.push);

  const pps = pxPerSec(zoomLevel);
  const pms = pps / 1000;
  const contentWidth = useMemo(() => {
    const projectMs = project?.durationMs ?? 60_000;
    return Math.max(1600, projectMs * pms + 200);
  }, [project?.durationMs, pms]);

  // Major-tick spacing in px — shared between ruler + row gridlines via CSS var.
  const majorSec = pps >= 80 ? 1 : pps >= 40 ? 2 : 5;
  const rowGridPx = majorSec * pps;

  const visibleTracks = useMemo(
    () => tracks.filter((t) => visibleTrackIds.includes(t.id)),
    [tracks, visibleTrackIds],
  );

  // Horizontal scroll observed by the ruler so its click-to-seek math accounts
  // for the offset; rows + playhead share the same scroll container naturally.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollX, setScrollX] = useState(0);
  const [snapLineX, setSnapLineX] = useState<number | null>(null);

  // ── Drag: move clip ─────────────────────────────────────────────────────
  const onClipMouseDown = useCallback(
    (e: React.MouseEvent, clip: Clip) => {
      e.preventDefault();
      selectClip(clip.id, e.shiftKey);

      // Blade tool replaces drag with split-on-click.
      if (activeTool === 'blade') {
        const innerRect = scrollRef.current
          ?.querySelector<HTMLDivElement>('.tl-inner')
          ?.getBoundingClientRect();
        if (!innerRect) return;
        const t = pxToMs(e.clientX - innerRect.left, zoomLevel);
        seek(t);
        splitClipAt(clip.id, t);
        return;
      }

      const startX = e.clientX;
      const startPos = clip.posMs;
      let moved = false;

      const onMove = (ev: MouseEvent) => {
        const dMs = (ev.clientX - startX) / pms;
        let newPos = Math.max(0, startPos + dMs);
        let snappedTo: number | null = null;

        if (snapEnabled && !ev.altKey) {
          const candidates: number[] = [0, usePlaybackStore.getState().currentTimeMs];
          for (const c of clips) {
            if (c.id !== clip.id) candidates.push(c.posMs, c.posMs + c.durMs);
          }
          const r = snapMath(newPos, clip.durMs, candidates, zoomLevel, SNAP_THRESHOLD_PX);
          newPos = r.posMs;
          snappedTo = r.snappedTo;
        }

        setSnapLineX(snappedTo !== null ? msToPx(snappedTo, zoomLevel) : null);
        moveClip(clip.id, newPos);
        moved = true;
      };

      const onUp = () => {
        setSnapLineX(null);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (moved) {
          pushHistory({ type: 'clip.move', desc: `Moved ${clip.name}` });
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [activeTool, clips, moveClip, pms, pushHistory, seek, selectClip, snapEnabled, splitClipAt, zoomLevel],
  );

  // ── Drag: trim handles ─────────────────────────────────────────────────
  const makeTrimHandler = useCallback(
    (side: 'left' | 'right') =>
      (e: React.MouseEvent, clip: Clip) => {
        e.preventDefault();
        selectClip(clip.id);
        const startX = e.clientX;
        const startPos = clip.posMs;
        const startDur = clip.durMs;
        let moved = false;

        const onMove = (ev: MouseEvent) => {
          const dMs = (ev.clientX - startX) / pms;
          if (side === 'right') {
            resizeClip(clip.id, startPos, Math.max(400, startDur + dMs));
          } else {
            // Pin right edge: dragging left = posMs decreases, durMs increases.
            const newPos = Math.max(0, startPos + dMs);
            const consumed = newPos - startPos;
            const newDur = Math.max(400, startDur - consumed);
            resizeClip(clip.id, newPos, newDur);
          }
          moved = true;
        };

        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          if (moved) {
            pushHistory({ type: 'clip.trim', desc: `Trimmed ${side}` });
          }
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      },
    [pms, pushHistory, resizeClip, selectClip],
  );

  const onTrimLeftMouseDown = useMemo(() => makeTrimHandler('left'), [makeTrimHandler]);
  const onTrimRightMouseDown = useMemo(() => makeTrimHandler('right'), [makeTrimHandler]);

  // ── Drop target: create a clip from an asset drag ──────────────────────
  const onRowDrop = (e: React.DragEvent, track: Track) => {
    e.preventDefault();
    const assetId = e.dataTransfer.getData('application/x-cloudcut-asset');
    if (!assetId) return;
    const asset = MOCK_ASSET_INDEX[assetId];
    if (!asset || asset.durMs == null) return;
    // Reject incompatible drops: image → audio, audio → video, etc.
    const compat =
      (track.type === 'video' && asset.type !== 'audio') ||
      (track.type === 'audio' && asset.type === 'audio');
    if (!compat) return;

    const innerRect = scrollRef.current
      ?.querySelector<HTMLDivElement>('.tl-inner')
      ?.getBoundingClientRect();
    if (!innerRect) return;
    const dropMs = Math.max(0, pxToMs(e.clientX - innerRect.left, zoomLevel));
    const id = addClip({
      trackId: track.id,
      assetId: asset.id,
      posMs: dropMs,
      durMs: asset.durMs,
      name: asset.name,
      thumbs: asset.thumb ? [asset.thumb] : undefined,
    });
    selectClip(id);
    pushHistory({ type: 'clip.add', desc: `Added ${asset.name}` });
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-line bg-surface-1">
      <TimelineToolbar />

      <div
        className="relative grid min-h-0 flex-1 overflow-hidden"
        style={{ gridTemplateColumns: 'var(--header-w) 1fr' }}
      >
        {/* Headers column (left) */}
        <div className="z-[2] flex flex-col overflow-hidden border-r border-line bg-surface-1">
          <div
            className="border-b border-line bg-surface-2"
            style={{ height: 'var(--ruler-h)' }}
          />
          <div className="flex-1 overflow-hidden">
            {visibleTracks.map((tr) => (
              <TrackHeader key={tr.id} track={tr} />
            ))}
          </div>
        </div>

        {/* Content (right) */}
        <div className="relative flex flex-col overflow-hidden bg-surface-0">
          <div
            ref={scrollRef}
            onScroll={(e) => setScrollX(e.currentTarget.scrollLeft)}
            className="relative flex-1 overflow-x-auto overflow-y-hidden"
          >
            <div
              className="tl-inner relative h-full"
              style={{ width: contentWidth, minWidth: '100%' }}
            >
              <TimelineRuler widthPx={contentWidth} zoomLevel={zoomLevel} scrollX={scrollX} />

              <div className="relative" style={{ ['--major-px' as string]: `${rowGridPx}px` }}>
                {visibleTracks.map((tr) => {
                  const trackClips = clips.filter((c) => c.trackId === tr.id);
                  return (
                    <div
                      key={tr.id}
                      className="cc-row-grid relative border-b border-line"
                      style={{ height: 'var(--row-h)' }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
                      }}
                      onDrop={(e) => onRowDrop(e, tr)}
                    >
                      {trackClips.map((c) => {
                        const editor = findEditorOf(c.id);
                        return (
                          <TimelineClip
                            key={c.id}
                            clip={c}
                            track={tr}
                            leftPx={c.posMs * pms}
                            widthPx={c.durMs * pms}
                            style={clipStyle}
                            selected={selectedIds.includes(c.id)}
                            beingEditedBy={showPresence ? editor : null}
                            onMouseDown={onClipMouseDown}
                            onTrimLeftMouseDown={onTrimLeftMouseDown}
                            onTrimRightMouseDown={onTrimRightMouseDown}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* Playhead — inside .tl-inner so it scrolls with content. */}
              <Playhead currentTimeMs={currentTimeMs} zoomLevel={zoomLevel} />

              {/* Snap guide rendered only during drag. */}
              {snapLineX !== null && (
                <div
                  className="pointer-events-none absolute top-0 bottom-0 z-[5]"
                  style={{
                    left: snapLineX,
                    width: 1,
                    background: 'var(--status-warn, var(--warn))',
                    boxShadow: '0 0 8px var(--warn)',
                  }}
                />
              )}

              {/* Remote collab cursors anchored to a timeline timecode. */}
              {showPresence &&
                Object.entries(cursors).map(([uid, cu]) => {
                  if (cu.target !== 'timeline' || !cu.visible || cu.timelineMs == null) return null;
                  const collab = collaborators.find((c) => c.name === cu.label);
                  return (
                    <div
                      key={uid}
                      className="pointer-events-none absolute top-0 bottom-0 z-[5]"
                      style={{
                        left: msToPx(cu.timelineMs, zoomLevel),
                        width: 1.5,
                        background: collab?.color ?? 'var(--collab-1)',
                        transition: 'left 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                      }}
                    >
                      <div
                        className="absolute -top-0.5 left-0.5 whitespace-nowrap rounded-r-sm px-1.5 py-px text-[9.5px] font-semibold text-white"
                        style={{ background: collab?.color ?? 'var(--collab-1)' }}
                      >
                        {cu.label}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  function findEditorOf(clipId: string): string | null {
    for (const c of Object.values(cursors)) {
      if (c.editingClipId === clipId) return c.label;
    }
    return null;
  }
}
