import { useMemo } from 'react';

import { cn } from '@/lib/utils';
import type { Clip, ClipStyle, Track } from '@/types';
import { fmtClipDur } from '@/utils/timecode';
import { waveformPath } from '@/utils/waveform';

interface TimelineClipProps {
  clip: Clip;
  track: Track;
  leftPx: number;
  widthPx: number;
  style: ClipStyle;
  selected: boolean;
  /** Collaborator label currently editing this clip (drives the pulse border). */
  beingEditedBy: string | null;
  onMouseDown: (e: React.MouseEvent, clip: Clip) => void;
  onTrimLeftMouseDown: (e: React.MouseEvent, clip: Clip) => void;
  onTrimRightMouseDown: (e: React.MouseEvent, clip: Clip) => void;
}

/**
 * A single clip block. Composes:
 *   - background color from the track's CSS var
 *   - body (thumbnails / waveform / flat) per the active `clipStyle` tweak
 *   - label + duration + fx pip dots
 *   - left/right trim handles (visible on hover or when selected)
 *   - collab pulse border (when another user is editing)
 */
export function TimelineClip({
  clip,
  track,
  leftPx,
  widthPx,
  style,
  selected,
  beingEditedBy,
  onMouseDown,
  onTrimLeftMouseDown,
  onTrimRightMouseDown,
}: TimelineClipProps) {
  const clipColor = `var(${track.colorVar})`;
  const borderColor = `color-mix(in oklch, ${clipColor} 70%, black)`;

  return (
    <div
      role="button"
      title={clip.name}
      onMouseDown={(e) => onMouseDown(e, clip)}
      className={cn(
        'cc-clip absolute overflow-hidden rounded select-none',
        selected && 'cc-clip-selected',
      )}
      style={{
        top: 4,
        bottom: 4,
        left: leftPx,
        width: widthPx,
        background: clipColor,
        border: `1px solid ${borderColor}`,
        boxShadow: '0 1px 0 rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08)',
        cursor: 'grab',
      }}
    >
      <div
        className="font-mono pointer-events-none absolute left-2 right-2 top-[3px] z-[2] truncate text-[11px] font-medium text-white"
        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
      >
        {clip.name}
      </div>

      <ClipBody clip={clip} track={track} style={style} widthPx={widthPx} />

      {clip.fx && clip.fx.length > 0 && (
        <div className="absolute bottom-[3px] left-1.5 z-[2] flex gap-[3px]">
          {clip.fx.slice(0, 3).map((_, i) => (
            <span
              key={i}
              className="block h-[5px] w-[5px] rounded-full"
              style={{ background: 'rgba(255,255,255,0.8)' }}
            />
          ))}
        </div>
      )}

      <div
        className="font-mono pointer-events-none absolute bottom-[3px] right-1.5 z-[2] text-[9px]"
        style={{ color: 'rgba(255,255,255,0.7)' }}
      >
        {fmtClipDur(clip.durMs)}
      </div>

      <TrimHandle side="left" onMouseDown={(e) => onTrimLeftMouseDown(e, clip)} />
      <TrimHandle side="right" onMouseDown={(e) => onTrimRightMouseDown(e, clip)} />

      {beingEditedBy && (
        <span
          className="pointer-events-none absolute -inset-[2px] rounded-md"
          style={{
            border: '2px solid var(--collab-1)',
            animation: 'var(--animate-cc-presence-pulse)',
          }}
          title={`${beingEditedBy} is editing`}
        />
      )}
    </div>
  );
}

/* ─── body variants ─────────────────────────────────────────────────────── */

function ClipBody({
  clip,
  track,
  style,
  widthPx,
}: {
  clip: Clip;
  track: Track;
  style: ClipStyle;
  widthPx: number;
}) {
  // Audio tracks: waveform or flat fill.
  if (track.type === 'audio') {
    if (style === 'flat') return <FlatStripes />;
    return <WaveformLayer clipId={clip.id} isMusic={clip.trackId === 'tr_a2'} widthPx={widthPx} opacity={0.75} />;
  }

  // Video tracks.
  if (style === 'flat') return <FlatStripes />;
  if (style === 'wave') {
    return <WaveformLayer clipId={clip.id} isMusic={false} widthPx={widthPx} opacity={0.3} />;
  }
  // 'rich' or 'thumb' — gradient strip stand-in for thumbnails.
  return <ThumbStrip thumbs={clip.thumbs ?? []} widthPx={widthPx} />;
}

function ThumbStrip({ thumbs, widthPx }: { thumbs: readonly string[]; widthPx: number }) {
  // n = max number of strips that fit at ≥60px each, capped by available thumbs.
  const slots = useMemo(() => {
    if (thumbs.length === 0) return [];
    const n = Math.max(1, Math.min(thumbs.length, Math.max(2, Math.floor(widthPx / 60))));
    return Array.from({ length: n }, (_, i) => thumbs[Math.floor((i * thumbs.length) / n)] ?? thumbs[0]);
  }, [thumbs, widthPx]);

  return (
    <div
      className="pointer-events-none absolute bottom-0 left-0 right-0 flex"
      style={{ top: 18, background: 'rgba(0,0,0,0.15)' }}
    >
      {slots.map((bg, i) => (
        <div
          key={i}
          className="h-full flex-1"
          style={{
            background: bg,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            minWidth: 30,
            borderRight: i === slots.length - 1 ? undefined : '1px solid rgba(0,0,0,0.2)',
          }}
        />
      ))}
    </div>
  );
}

function WaveformLayer({
  clipId,
  isMusic,
  widthPx,
  opacity,
}: {
  clipId: string;
  isMusic: boolean;
  widthPx: number;
  opacity: number;
}) {
  // Recompute path only when zoom changes meaningfully (widthPx changes per drag).
  const w = Math.max(widthPx, 20);
  const path = useMemo(() => waveformPath(clipId, isMusic, w, 40), [clipId, isMusic, w]);

  return (
    <svg
      preserveAspectRatio="none"
      viewBox={`0 0 ${w} 40`}
      className="pointer-events-none absolute bottom-0 left-0 right-0"
      style={{ top: 18 }}
    >
      <path d={path} stroke={`rgba(255,255,255,${opacity})`} strokeWidth={1} fill="none" />
    </svg>
  );
}

function FlatStripes() {
  return (
    <div
      className="pointer-events-none absolute bottom-0 left-0 right-0"
      style={{
        top: 18,
        background:
          'repeating-linear-gradient(45deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 4px, transparent 4px, transparent 8px)',
      }}
    />
  );
}

function TrimHandle({
  side,
  onMouseDown,
}: {
  side: 'left' | 'right';
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onMouseDown={(e) => {
        e.stopPropagation();
        onMouseDown(e);
      }}
      className="cc-trim-handle absolute top-0 bottom-0 z-[3] w-1.5 cursor-ew-resize opacity-0 transition-opacity"
      style={{
        [side]: 0,
        background:
          side === 'left'
            ? 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.25) 100%)'
            : 'linear-gradient(270deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.25) 100%)',
      }}
    />
  );
}
