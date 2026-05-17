import {
  CloudIcon,
  DownloadIcon,
  HistoryIcon,
  KeyboardIcon,
  MoonIcon,
  RedoIcon,
  Share2Icon,
  SunIcon,
  UndoIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  selectTotalDurationMs,
  useProjectStore,
} from '@/state/projectStore';
import {
  selectCanRedo,
  selectCanUndo,
  useHistoryStore,
} from '@/state/historyStore';
import { useUIStore } from '@/state/uiStore';
import { fmtClipDur } from '@/utils/timecode';

import { Presence } from './Presence';

export function TopBar() {
  const project = useProjectStore((s) => s.project);
  const totalDurationMs = useProjectStore(selectTotalDurationMs);
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const toggleShortcuts = useUIStore((s) => s.toggleShortcuts);
  const showShortcuts = useUIStore((s) => s.showShortcuts);
  const canUndo = useHistoryStore(selectCanUndo);
  const canRedo = useHistoryStore(selectCanRedo);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);
  const showHistoryPanel = useUIStore((s) => s.showHistoryPanel);
  const toggleHistoryPanel = useUIStore((s) => s.toggleHistoryPanel);
  const showPresence = useUIStore((s) => s.showPresence);

  return (
    <header
      className={cn(
        'relative z-30 flex h-12 items-center gap-3 overflow-hidden border-b border-line bg-surface-1 px-3',
      )}
    >
      {/* Brand */}
      <div className="flex shrink-0 items-center gap-2.5">
        <div className="grid h-[22px] w-[22px] place-items-center rounded-md bg-accent text-accent-foreground">
          <CloudIcon size={14} />
        </div>
        <span className="text-sm font-semibold tracking-tight">CloudCut</span>
        <span className="text-text-4">/</span>
      </div>

      {/* Project crumb */}
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        {project ? (
          <>
            <span className="shrink-0 text-text-3">{project.workspace}</span>
            <span className="shrink-0 text-text-4">/</span>
            <span
              title={project.name}
              className="min-w-0 shrink truncate font-medium text-text-1"
            >
              {project.name}
            </span>
            <span className="ml-2 inline-flex shrink-0 items-center gap-1.5 px-1.5 text-xs text-text-3">
              <span className="h-1.5 w-1.5 rounded-full bg-status-ok" />
              Saved · just now
            </span>
          </>
        ) : (
          <span className="text-text-3">Loading project…</span>
        )}
      </div>

      {/* Project stats */}
      {project && (
        <div className="font-mono flex shrink-0 items-center gap-1.5 text-[11px] text-text-3">
          <span>{project.resolution}</span>
          <span className="text-text-4">·</span>
          <span>{project.fps}fps</span>
          <span className="text-text-4">·</span>
          <span>{fmtClipDur(totalDurationMs)}</span>
        </div>
      )}

      <Divider />

      {/* Undo / redo / history */}
      <div className="flex shrink-0 items-center gap-1">
        <IconBtn title="Undo (⌘Z)" disabled={!canUndo} onClick={undo}>
          <UndoIcon size={14} />
        </IconBtn>
        <IconBtn title="Redo (⇧⌘Z)" disabled={!canRedo} onClick={redo}>
          <RedoIcon size={14} />
        </IconBtn>
        <IconBtn
          title="History"
          onClick={toggleHistoryPanel}
          active={showHistoryPanel}
        >
          <HistoryIcon size={14} />
        </IconBtn>
      </div>

      {showPresence && (
        <>
          <Divider />
          <div className="shrink-0">
            <Presence />
          </div>
        </>
      )}

      <Divider />

      {/* Theme + shortcuts + share + export */}
      <div className="flex shrink-0 items-center gap-1.5">
        <IconBtn
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'}`}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <SunIcon size={14} /> : <MoonIcon size={14} />}
        </IconBtn>
        <IconBtn
          title="Keyboard shortcuts (?)"
          onClick={toggleShortcuts}
          active={showShortcuts}
        >
          <KeyboardIcon size={14} />
        </IconBtn>
        <button
          type="button"
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-surface-2 px-3',
            'text-xs text-text-2 hover:bg-surface-3 hover:text-text-1',
          )}
        >
          <Share2Icon size={13} /> Share
        </button>
        <button
          type="button"
          className={cn(
            'inline-flex h-[30px] items-center gap-1.5 rounded-md bg-accent px-3',
            'text-xs font-semibold text-accent-foreground hover:brightness-105',
          )}
        >
          <DownloadIcon size={13} /> Export
        </button>
      </div>
    </header>
  );
}

function Divider() {
  return <div className="my-2 h-7 w-px shrink-0 bg-line" />;
}

interface IconBtnProps {
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
  onClick?: () => void;
}

function IconBtn({ title, children, disabled, active, onClick }: IconBtnProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5',
        'text-text-2 hover:bg-surface-3 hover:text-text-1',
        active && 'bg-surface-3 text-text-1',
        'disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-2',
      )}
    >
      {children}
    </button>
  );
}
