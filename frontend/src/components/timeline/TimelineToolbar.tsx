import { useEffect, useRef, useState } from 'react';
import {
  FilmIcon,
  HandIcon,
  MagnetIcon,
  MinusIcon,
  MousePointer2Icon,
  MusicIcon,
  PlusIcon,
  ScissorsIcon,
  Trash2Icon,
  UsersIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';
import { usePlaybackStore } from '@/state/playbackStore';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import type { Tool } from '@/types';
import { pxPerSec } from '@/utils/geometry';

const TOOL_DEFS: ReadonlyArray<{ id: Tool; title: string; Icon: typeof MousePointer2Icon }> = [
  { id: 'select', title: 'Select (V)',       Icon: MousePointer2Icon },
  { id: 'blade',  title: 'Blade / Split (S)', Icon: ScissorsIcon },
  { id: 'hand',   title: 'Hand (H)',          Icon: HandIcon },
];

/**
 * 36px toolbar at the top of the Timeline. Owns:
 *   - Tool group  (select / blade / hand)
 *   - Split + Delete actions  (operate on current selection)
 *   - Snap toggle
 *   - Zoom controls (-/value/+/Fit)
 */
export function TimelineToolbar() {
  const activeTool = useUIStore((s) => s.activeTool);
  const setTool = useUIStore((s) => s.setTool);
  const snapEnabled = useUIStore((s) => s.snapEnabled);
  const toggleSnap = useUIStore((s) => s.toggleSnap);
  const showPresence = useUIStore((s) => s.showPresence);
  const setShowPresence = useUIStore((s) => s.setShowPresence);
  const zoomLevel = useUIStore((s) => s.zoomLevel);
  const zoomIn = useUIStore((s) => s.zoomIn);
  const zoomOut = useUIStore((s) => s.zoomOut);
  const zoomFit = useUIStore((s) => s.zoomFit);
  const selected = useUIStore((s) => s.selectedClipIds);
  const splitClipAt = useProjectStore((s) => s.splitClipAt);
  const deleteClips = useProjectStore((s) => s.deleteClips);
  const addTrack = useProjectStore((s) => s.addTrack);
  const { canEditTimeline } = usePermissions();

  const splitSelected = () => {
    // Read the playhead at click time so the toolbar doesn't re-render
    // every animation frame just to keep `currentTimeMs` fresh.
    const t = usePlaybackStore.getState().currentTimeMs;
    for (const id of selected) splitClipAt(id, t);
  };

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-surface-1 px-3">
      {/* Tool group */}
      <div className="flex items-center rounded-md border border-line bg-surface-2 p-0.5">
        {TOOL_DEFS.map(({ id, title, Icon }) => (
          <button
            key={id}
            type="button"
            title={title}
            onClick={() => setTool(id)}
            className={cn(
              'grid h-[22px] w-[26px] place-items-center rounded',
              activeTool === id
                ? 'bg-surface-3 text-text-1'
                : 'text-text-3 hover:text-text-1',
            )}
          >
            <Icon size={13} />
          </button>
        ))}
      </div>

      <Divider />

      <ActionBtn
        title={!canEditTimeline ? 'Viewer role — editing not allowed' : 'Split at playhead (S)'}
        onClick={splitSelected}
        disabled={!canEditTimeline || selected.length === 0}
      >
        <ScissorsIcon size={12} /> <span className="text-[11px]">Split</span>
      </ActionBtn>
      <ActionBtn
        title={!canEditTimeline ? 'Viewer role — editing not allowed' : 'Delete selected (Del)'}
        onClick={() => deleteClips(selected)}
        disabled={!canEditTimeline || selected.length === 0}
      >
        <Trash2Icon size={12} />
      </ActionBtn>

      <Divider />

      <button
        type="button"
        title="Snap (N)"
        onClick={toggleSnap}
        className={cn(
          'flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-[11px]',
          snapEnabled
            ? 'bg-accent-soft text-accent'
            : 'text-text-3 hover:text-text-1',
        )}
      >
        <MagnetIcon size={11} /> <span>Snap</span>
      </button>

      <button
        type="button"
        title={showPresence ? 'Hide collaborators' : 'Show collaborators'}
        onClick={() => setShowPresence(!showPresence)}
        className={cn(
          'flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-[11px]',
          showPresence
            ? 'bg-accent-soft text-accent'
            : 'text-text-3 hover:text-text-1',
        )}
      >
        <UsersIcon size={11} /> <span>Collab</span>
      </button>

      <Divider />

      <AddTrackButton disabled={!canEditTimeline} onAdd={addTrack} />

      <div className="flex-1" />

      {/* Zoom */}
      <div className="flex items-center gap-1.5 text-[11px] text-text-3">
        <IconBtn title="Zoom out" onClick={zoomOut}>
          <MinusIcon size={11} />
        </IconBtn>
        <span
          className="font-mono min-w-[34px] text-center text-[11px] text-text-2"
          title={`zoom ${zoomLevel.toFixed(2)}×`}
        >
          {Math.round(pxPerSec(zoomLevel))}px/s
        </span>
        <IconBtn title="Zoom in" onClick={zoomIn}>
          <PlusIcon size={11} />
        </IconBtn>
        <button
          type="button"
          title="Zoom to fit (⌘0)"
          onClick={zoomFit}
          className="rounded px-2 py-0.5 text-[10px] text-text-2 hover:bg-surface-3 hover:text-text-1"
        >
          Fit
        </button>
      </div>

    </div>
  );
}

/* ─── primitives ─── */

function Divider() {
  return <div className="h-[18px] w-px bg-line" />;
}

function ActionBtn({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-md px-2 text-text-2',
        'hover:bg-surface-3 hover:text-text-1',
        'disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent',
      )}
    >
      {children}
    </button>
  );
}

function IconBtn({
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
      className="grid h-[22px] w-[22px] place-items-center rounded text-text-2 hover:bg-surface-3 hover:text-text-1"
    >
      {children}
    </button>
  );
}

function AddTrackButton({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (kind: 'video' | 'audio', name: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handle = async (kind: 'video' | 'audio', name: string) => {
    setOpen(false);
    setBusy(true);
    try { await onAdd(kind, name); } finally { setBusy(false); }
  };

  const nextVideoNum = () => {
    const tracks = useProjectStore.getState().tracks;
    const count = tracks.filter((t) => t.type === 'video').length;
    return `Video ${count + 1}`;
  };
  const nextAudioNum = () => {
    const tracks = useProjectStore.getState().tracks;
    const count = tracks.filter((t) => t.type === 'audio').length;
    return `Audio ${count + 1}`;
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled || busy}
        title={disabled ? 'Viewer role — editing not allowed' : 'Add track'}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-text-2',
          'hover:bg-surface-3 hover:text-text-1',
          'disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent',
          open && 'bg-surface-3 text-text-1',
        )}
      >
        <PlusIcon size={11} />
        <span>{busy ? '…' : 'Add Track'}</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          className={cn(
            'absolute top-full left-0 z-[50] mt-1 w-44 overflow-hidden rounded-md border border-line',
            'bg-surface-2 py-1 shadow-xl',
          )}
        >
          <button
            type="button"
            onClick={() => void handle('video', nextVideoNum())}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-2 hover:bg-surface-3 hover:text-text-1"
          >
            <FilmIcon size={11} className="text-[var(--clip-v-1)]" /> Video track
          </button>
          <button
            type="button"
            onClick={() => void handle('audio', nextAudioNum())}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-2 hover:bg-surface-3 hover:text-text-1"
          >
            <MusicIcon size={11} className="text-[var(--clip-a-1)]" /> Audio track
          </button>
        </div>
      )}
    </div>
  );
}
