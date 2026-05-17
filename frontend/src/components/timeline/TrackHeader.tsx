import {
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  UnlockIcon,
  Volume2Icon,
  VolumeXIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useProjectStore } from '@/state/projectStore';
import type { Track } from '@/types';

interface TrackHeaderProps {
  track: Track;
}

/**
 * Left-column row matching the timeline ruler height + track row height.
 * Color swatch is a 3px vertical strip pulled from the track's CSS var
 * (same accent the clips on that track use).
 */
export function TrackHeader({ track }: TrackHeaderProps) {
  const toggleTrack = useProjectStore((s) => s.toggleTrack);

  return (
    <div
      className="relative flex items-center gap-2 border-b border-line bg-surface-1 px-2.5"
      style={{ height: 'var(--row-h)' }}
    >
      <div
        className="my-2 self-stretch rounded-sm"
        style={{ width: 3, background: `var(${track.colorVar})` }}
      />

      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium text-text-1">
          {track.label}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span
            className={cn(
              'font-mono rounded-sm bg-surface-2 px-1 py-px',
              'text-[9px] uppercase tracking-[0.05em] text-text-4',
            )}
          >
            {track.type === 'video' ? 'VIDEO' : 'AUDIO'}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 gap-0.5">
        <Toggle
          on={!track.muted}
          mutedColor
          title={track.muted ? 'Unmute' : 'Mute'}
          onClick={() => toggleTrack(track.id, 'muted')}
        >
          {track.muted ? <VolumeXIcon size={11} /> : <Volume2Icon size={11} />}
        </Toggle>
        <Toggle
          on={!track.locked}
          mutedColor
          title={track.locked ? 'Unlock' : 'Lock'}
          onClick={() => toggleTrack(track.id, 'locked')}
        >
          {track.locked ? <LockIcon size={11} /> : <UnlockIcon size={11} />}
        </Toggle>
        <Toggle
          on={track.visible}
          title={track.visible ? 'Hide' : 'Show'}
          onClick={() => toggleTrack(track.id, 'visible')}
        >
          {track.visible ? <EyeIcon size={11} /> : <EyeOffIcon size={11} />}
        </Toggle>
      </div>
    </div>
  );
}

interface ToggleProps {
  on: boolean;
  /** When true and `on === false`, paints the icon red (danger) — used for mute. */
  mutedColor?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}

function Toggle({ on, mutedColor, title, onClick, children }: ToggleProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'grid h-5 w-5 place-items-center rounded',
        on ? 'text-text-1' : mutedColor ? 'text-status-danger' : 'text-text-4',
        'hover:bg-surface-3',
      )}
    >
      {children}
    </button>
  );
}
