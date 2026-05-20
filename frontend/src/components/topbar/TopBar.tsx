import { useEffect, useRef, useState } from 'react';
import {
  CloudIcon,
  DownloadIcon,
  HistoryIcon,
  KeyboardIcon,
  LogOutIcon,
  MoonIcon,
  RedoIcon,
  Share2Icon,
  ShieldIcon,
  SunIcon,
  UndoIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useAuthStore } from '@/state/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import {
  selectCanRedo,
  selectCanUndo,
  selectTotalDurationMs,
  useProjectStore,
} from '@/state/projectStore';
import { useHistoryStore } from '@/state/historyStore';
import { useUIStore } from '@/state/uiStore';
import { fmtClipDur } from '@/utils/timecode';

import { Presence } from './Presence';
import { WorkspaceProjectSelector } from './WorkspaceProjectSelector';

export function TopBar() {
  const project = useProjectStore((s) => s.project);
  const totalDurationMs = useProjectStore(selectTotalDurationMs);
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const toggleShortcuts = useUIStore((s) => s.toggleShortcuts);
  const showShortcuts = useUIStore((s) => s.showShortcuts);
  const canUndo = useProjectStore(selectCanUndo);
  const canRedo = useProjectStore(selectCanRedo);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);
  const showHistoryPanel = useUIStore((s) => s.showHistoryPanel);
  const toggleHistoryPanel = useUIStore((s) => s.toggleHistoryPanel);
  const showPresence = useUIStore((s) => s.showPresence);
  const toast = useHistoryStore((s) => s.toast);
  const { canExport, role } = usePermissions();
  const showMembersPanel = useUIStore((s) => s.showMembersPanel);
  const toggleMembersPanel = useUIStore((s) => s.toggleMembersPanel);

  const handleShare = async () => {
    const url = window.location.href;
    // navigator.clipboard.writeText requires HTTPS or localhost — fall back to
    // a textarea+execCommand for environments where the API is missing.
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast({ who: 'Share', body: 'Project link copied to clipboard' });
    } catch {
      toast({ who: 'Share', body: 'Could not copy — copy the URL manually' });
    }
  };

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

      {/* Workspace + project selector */}
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        {project ? (
          <>
            <WorkspaceProjectSelector />
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
          <div className="flex shrink-0 items-center gap-1.5">
            <Presence />
            <IconBtn
              title="Manage members"
              onClick={toggleMembersPanel}
              active={showMembersPanel}
            >
              <ShieldIcon size={13} />
            </IconBtn>
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
        <UserMenu />
        <button
          type="button"
          onClick={handleShare}
          title="Copy project link to clipboard"
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-surface-2 px-3',
            'text-xs text-text-2 hover:bg-surface-3 hover:text-text-1',
          )}
        >
          <Share2Icon size={13} /> Share
        </button>
        <button
          type="button"
          onClick={() => canExport && useUIStore.getState().toggleExportDialog()}
          disabled={!canExport}
          title={!canExport ? `${role ?? 'viewer'} role — export not allowed` : 'Export project'}
          className={cn(
            'inline-flex h-[30px] items-center gap-1.5 rounded-md bg-accent px-3',
            'text-xs font-semibold text-accent-foreground hover:brightness-105',
            !canExport && 'cursor-not-allowed opacity-40 hover:brightness-100',
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

/** Avatar + click-to-open menu with the signed-in email and a Logout action. */
function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [open, setOpen] = useState(false);
  // The dropdown is positioned with `fixed` coordinates derived from the
  // button's bounding rect because <header> has `overflow-hidden`, which
  // would clip an `absolute` child.
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // Compute position relative to the viewport
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
    }
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!buttonRef.current?.contains(t) && !menuRef.current?.contains(t)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (!user) return null;

  const initials = (user.display_name || user.email)
    .split(/\s+|@/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        title={user.email}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'grid h-7 w-7 place-items-center rounded-full bg-surface-3 text-[10px] font-semibold',
          'text-text-1 hover:bg-surface-3/80',
          open && 'ring-1 ring-accent',
        )}
      >
        {initials || '?'}
      </button>
      {open && (
        <div
          ref={menuRef}
          // z-[60] keeps us above the header (z-30) AND the resizable panels.
          className={cn(
            'fixed z-[60] w-56 overflow-hidden rounded-md border border-line',
            'bg-surface-2 py-1 shadow-lg',
          )}
          style={{ top: pos.top, right: pos.right }}
        >
          <div className="px-3 py-2">
            <div className="truncate text-xs font-medium text-text-1">
              {user.display_name}
            </div>
            <div className="truncate text-[10px] text-text-3">{user.email}</div>
          </div>
          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-2 text-left text-xs',
              'text-text-2 hover:bg-surface-3 hover:text-text-1',
            )}
          >
            <LogOutIcon size={13} /> Sign out
          </button>
        </div>
      )}
    </>
  );
}
