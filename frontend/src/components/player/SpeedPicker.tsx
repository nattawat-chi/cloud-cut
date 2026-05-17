import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { usePlaybackStore } from '@/state/playbackStore';

const SPEEDS = [0.25, 0.5, 1, 1.5, 2] as const;

/**
 * Compact playback-speed picker — renders as a pill that opens a tiny popover.
 * Closes on outside click + Escape so it behaves like a menu without bringing
 * in a full popover primitive (shadcn's `popover` is overkill for 5 options).
 */
export function SpeedPicker() {
  const speed = usePlaybackStore((s) => s.playbackSpeed);
  const setSpeed = usePlaybackStore((s) => s.setSpeed);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'font-mono cursor-pointer rounded-full border border-line-soft bg-surface-3 px-2 py-0.5',
          'text-[10px] text-text-2 hover:text-text-1',
        )}
      >
        {speed}× ▾
      </button>
      {open && (
        <div
          className="absolute right-0 z-20 mb-1.5 min-w-[60px] rounded-md border border-line bg-surface-2 p-1 shadow-lg"
          style={{ bottom: '100%' }}
        >
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setSpeed(s);
                setOpen(false);
              }}
              className={cn(
                'font-mono block w-full cursor-pointer rounded-sm px-2.5 py-1.5 text-left text-[11px]',
                s === speed ? 'bg-accent-soft text-accent' : 'text-text-1 hover:bg-surface-3',
              )}
            >
              {s}×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
