import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  Volume2Icon,
  VolumeXIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { usePlaybackStore } from '@/state/playbackStore';
import { useProjectStore } from '@/state/projectStore';
import { fmtTC } from '@/utils/timecode';

import { SpeedPicker } from './SpeedPicker';

const FRAME_MS = 1000 / 30;

/**
 * Transport bar (44px) under the player stage.
 * Layout: [TC]  [skipBack stepBack PLAY stepFwd skipFwd]  [volume]  [speed]
 */
export function PlayerControls() {
  const currentTimeMs = usePlaybackStore((s) => s.currentTimeMs);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const volume = usePlaybackStore((s) => s.volume);
  const isMuted = usePlaybackStore((s) => s.isMuted);
  const togglePlay = usePlaybackStore((s) => s.togglePlay);
  const seek = usePlaybackStore((s) => s.seek);
  const setVolume = usePlaybackStore((s) => s.setVolume);
  const toggleMute = usePlaybackStore((s) => s.toggleMute);
  const project = useProjectStore((s) => s.project);

  const duration = project?.durationMs ?? 0;
  const fps = project?.fps ?? 30;

  return (
    <div className="flex h-11 items-center gap-3 border-t border-line bg-surface-1 px-3.5">
      <TCDisplay current={currentTimeMs} total={duration} fps={fps} />

      <div className="flex flex-1 items-center justify-center gap-0.5">
        <Btn title="Go to start (Home)" onClick={() => seek(0)}>
          <SkipBackIcon size={13} />
        </Btn>
        <Btn
          title="Step back (←)"
          onClick={() => seek(usePlaybackStore.getState().currentTimeMs - FRAME_MS)}
        >
          <ChevronLeftIcon size={14} />
        </Btn>
        <button
          type="button"
          title="Play / Pause (Space)"
          onClick={togglePlay}
          className={cn(
            'grid h-[30px] w-9 place-items-center rounded-md',
            isPlaying ? 'bg-accent text-accent-foreground' : 'bg-surface-3 text-text-1',
            'hover:bg-accent hover:text-accent-foreground',
          )}
        >
          {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={13} fill="currentColor" />}
        </button>
        <Btn
          title="Step forward (→)"
          onClick={() => seek(usePlaybackStore.getState().currentTimeMs + FRAME_MS)}
        >
          <ChevronRightIcon size={14} />
        </Btn>
        <Btn title="Go to end (End)" onClick={() => seek(duration)}>
          <SkipForwardIcon size={13} />
        </Btn>
      </div>

      <div className="flex items-center gap-1.5 text-text-3">
        <Btn title={isMuted ? 'Unmute' : 'Mute'} onClick={toggleMute}>
          {isMuted ? <VolumeXIcon size={14} /> : <Volume2Icon size={14} />}
        </Btn>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={isMuted ? 0 : volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="cc-volume h-1 w-[70px] cursor-pointer appearance-none rounded-sm bg-surface-3"
          style={{
            background: `linear-gradient(to right, var(--text-2) 0%, var(--text-2) ${(isMuted ? 0 : volume) * 100}%, var(--bg-3) ${(isMuted ? 0 : volume) * 100}%, var(--bg-3) 100%)`,
          }}
        />
      </div>

      <SpeedPicker />
    </div>
  );
}

function TCDisplay({ current, total, fps }: { current: number; total: number; fps: number }) {
  return (
    <div className="font-mono flex min-w-[150px] items-center gap-1.5 text-xs text-text-1">
      <span>{fmtTC(current, fps)}</span>
      <span className="text-text-4">/</span>
      <span className="text-text-3">{fmtTC(total, fps)}</span>
    </div>
  );
}

function Btn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'grid h-[30px] w-[30px] place-items-center rounded-md',
        'text-text-2 hover:bg-surface-3 hover:text-text-1',
      )}
    >
      {children}
    </button>
  );
}
