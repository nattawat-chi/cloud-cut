/**
 * WorkspaceProjectSelector — twin dropdowns in the TopBar breadcrumb that
 * let the user switch between the workspaces they belong to and the projects
 * within the active workspace.
 *
 * Each dropdown is a click-toggle button with a fixed-positioned panel below
 * (same pattern as `UserMenu` in TopBar.tsx — header has `overflow-hidden`,
 * so the panel must live outside the normal flow).
 */

import { useEffect, useRef, useState } from 'react';
import { CheckIcon, ChevronDownIcon, FolderIcon, PlusIcon, Settings2Icon, Trash2Icon, UsersIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';
import { useWorkspaceUsage } from '@/hooks/useWorkspaceUsage';
import { ApiError } from '@/services/api';
import { useProjectStore } from '@/state/projectStore';
import type { WorkspacePlan } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';

// ── Generic dropdown shell ────────────────────────────────────────────────────

interface DropdownProps {
  label: string;
  icon: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
}

function Dropdown({ label, icon, children }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef   = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 6, left: rect.left });

    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!buttonRef.current?.contains(t) && !menuRef.current?.contains(t)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-1.5 py-1',
          'text-xs text-text-2 hover:bg-surface-3 hover:text-text-1',
          open && 'bg-surface-3 text-text-1',
        )}
      >
        <span className="text-text-4">{icon}</span>
        <span className="max-w-[180px] truncate">{label}</span>
        <ChevronDownIcon size={11} className="text-text-4" />
      </button>

      {open && (
        <div
          ref={menuRef}
          className={cn(
            'fixed z-[60] w-64 overflow-hidden rounded-md border border-line',
            'bg-surface-2 py-1 shadow-xl',
          )}
          style={{ top: pos.top, left: pos.left }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-4">
      {children}
    </div>
  );
}

function Item({
  active,
  onClick,
  primary,
  secondary,
}: {
  active?: boolean;
  onClick: () => void;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs',
        'text-text-2 hover:bg-surface-3 hover:text-text-1',
        active && 'text-text-1',
      )}
    >
      <CheckIcon
        size={11}
        className={cn('shrink-0', active ? 'text-accent' : 'text-transparent')}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{primary}</span>
        {secondary && (
          <span className="block truncate text-[10px] text-text-4">{secondary}</span>
        )}
      </span>
    </button>
  );
}

function CreateRow({
  label,
  busy,
  onSubmit,
}: {
  label: string;
  busy: boolean;
  onSubmit: (name: string) => void;
}) {
  const [value, setValue] = useState('');
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs',
          'text-text-3 hover:bg-surface-3 hover:text-text-1',
        )}
      >
        <PlusIcon size={11} /> {label}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onSubmit(value.trim());
        setValue('');
        setEditing(false);
      }}
      className="flex items-center gap-1 px-2 py-1.5"
    >
      <input
        autoFocus
        type="text"
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => !value && setEditing(false)}
        placeholder="Name…"
        className={cn(
          'min-w-0 flex-1 rounded-md border border-line bg-surface-1 px-2 py-1',
          'text-xs text-text-1 placeholder:text-text-4',
          'focus:border-accent focus:outline-none',
        )}
      />
      <button
        type="submit"
        disabled={busy || !value.trim()}
        className={cn(
          'rounded-md bg-accent px-2 py-1 text-[10px] font-semibold text-accent-foreground',
          'disabled:cursor-default disabled:opacity-40',
        )}
      >
        {busy ? '…' : 'Add'}
      </button>
    </form>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export function WorkspaceProjectSelector() {
  const workspaces        = useProjectStore((s) => s.availableWorkspaces);
  const projects          = useProjectStore((s) => s.availableProjects);
  const currentWorkspaceId = useProjectStore((s) => s.currentWorkspaceId);
  const currentProjectId  = useProjectStore((s) => s.project?.id ?? null);
  const selectWorkspace   = useProjectStore((s) => s.selectWorkspace);
  const selectProject     = useProjectStore((s) => s.selectProject);
  const createProject     = useProjectStore((s) => s.createProject);
  const createWorkspace   = useProjectStore((s) => s.createWorkspace);
  const archiveProject       = useProjectStore((s) => s.archiveProject);
  const toggleProjectSettings = useUIStore((s) => s.toggleProjectSettings);

  const { canManageMembers, canEditTimeline } = usePermissions();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentWs = workspaces.find((w) => w.id === currentWorkspaceId);
  const currentPj = projects.find((p) => p.id === currentProjectId);

  const run = async <T,>(fn: () => Promise<T>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <Dropdown label={currentWs?.name ?? '…'} icon={<UsersIcon size={11} />}>
        {(close) => (
          <>
            <Section>Workspaces</Section>
            {workspaces.map((w) => (
              <Item
                key={w.id}
                active={w.id === currentWorkspaceId}
                primary={
                  <span className="flex items-center gap-1.5">
                    <span className="truncate">{w.name}</span>
                    <PlanBadge plan={w.plan} />
                  </span>
                }
                secondary={`${w.role} · ${planLimitsLabel(w.plan)}`}
                onClick={() => {
                  close();
                  void run(() => selectWorkspace(w.id));
                }}
              />
            ))}
            <div className="my-1 h-px bg-line" />
            <CreateRow
              label="New workspace"
              busy={busy}
              onSubmit={(name) => {
                close();
                void run(() => createWorkspace(name));
              }}
            />
          </>
        )}
      </Dropdown>

      {currentWs && (
        <PlanBadge
          plan={currentWs.plan}
          workspaceId={currentWs.id}
        />
      )}

      <span className="text-text-4">/</span>

      {/* Project dropdown + hover gear icon */}
      <div className="group/pj flex items-center gap-0.5">
        <Dropdown label={currentPj?.name ?? '…'} icon={<FolderIcon size={11} />}>
          {(close) => (
            <>
              <Section>Projects in {currentWs?.name ?? '…'}</Section>
              {projects.length === 0 && (
                <div className="px-3 py-2 text-[11px] text-text-4">
                  No projects yet.
                </div>
              )}
              {projects.map((p) => (
                <div key={p.id} className="group flex items-center">
                  <Item
                    active={p.id === currentProjectId}
                    primary={p.name}
                    secondary={`${p.fps}fps · ${p.resolution}`}
                    onClick={() => {
                      close();
                      void run(() => selectProject(p.id));
                    }}
                  />
                  {canManageMembers && (
                    <button
                      type="button"
                      title="Archive project"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!window.confirm(`Archive "${p.name}"? It will be hidden from the project list.`)) return;
                        close();
                        void run(() => archiveProject(p.id));
                      }}
                      className={cn(
                        'invisible group-hover:visible shrink-0 mr-2',
                        'grid h-5 w-5 place-items-center rounded',
                        'text-text-4 hover:text-status-danger hover:bg-surface-3',
                      )}
                    >
                      <Trash2Icon size={11} />
                    </button>
                  )}
                </div>
              ))}
              {currentWorkspaceId && (
                <>
                  <div className="my-1 h-px bg-line" />
                  <CreateProjectRow
                    busy={busy}
                    onSubmit={(name, fps, resW, resH) => {
                      close();
                      void run(() => createProject(currentWorkspaceId, name, fps, resW, resH));
                    }}
                  />
                </>
              )}
            </>
          )}
        </Dropdown>

        {/* Gear icon — appears on hover over the project breadcrumb, editor+ only */}
        {canEditTimeline && currentPj && (
          <button
            type="button"
            title="Project settings"
            onClick={toggleProjectSettings}
            className={cn(
              'invisible group-hover/pj:visible',
              'grid h-5 w-5 place-items-center rounded',
              'text-text-4 hover:bg-surface-3 hover:text-text-1',
            )}
          >
            <Settings2Icon size={11} />
          </button>
        )}
      </div>

      {error && (
        <span className="text-[10px] text-red-400" title={error}>
          · failed
        </span>
      )}
    </div>
  );
}

// ── Create project row (includes resolution preset) ───────────────────────────

const PROJECT_PRESETS = [
  { label: '1080p 30fps', fps: 30, w: 1920, h: 1080 },
  { label: '1080p 60fps', fps: 60, w: 1920, h: 1080 },
  { label: '720p 30fps',  fps: 30, w: 1280, h: 720  },
  { label: '4K 30fps',   fps: 30, w: 3840, h: 2160 },
] as const;

function CreateProjectRow({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (name: string, fps: number, resW: number, resH: number) => void;
}) {
  const [value, setValue]   = useState('');
  const [preset, setPreset] = useState(PROJECT_PRESETS[0]!.label);
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs',
          'text-text-3 hover:bg-surface-3 hover:text-text-1',
        )}
      >
        <PlusIcon size={11} /> New project
      </button>
    );
  }

  const selected = PROJECT_PRESETS.find((p) => p.label === preset) ?? PROJECT_PRESETS[0]!;

  return (
    <div className="px-2 pt-1.5 pb-2 space-y-1.5">
      <input
        autoFocus
        type="text"
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => !value && setEditing(false)}
        placeholder="Project name…"
        className={cn(
          'w-full rounded-md border border-line bg-surface-1 px-2 py-1',
          'text-xs text-text-1 placeholder:text-text-4',
          'focus:border-accent focus:outline-none',
        )}
      />
      <select
        value={preset}
        disabled={busy}
        onChange={(e) => setPreset(e.target.value)}
        className={cn(
          'w-full rounded-md border border-line bg-surface-1 px-2 py-1',
          'text-xs text-text-2 focus:border-accent focus:outline-none',
        )}
      >
        {PROJECT_PRESETS.map((p) => (
          <option key={p.label} value={p.label}>{p.label}</option>
        ))}
      </select>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="flex-1 rounded-md border border-line bg-surface-2 py-1 text-[10px] text-text-3 hover:text-text-1"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !value.trim()}
          onClick={() => {
            if (!value.trim()) return;
            onSubmit(value.trim(), selected.fps, selected.w, selected.h);
            setValue('');
            setEditing(false);
          }}
          className={cn(
            'flex-1 rounded-md bg-accent py-1 text-[10px] font-semibold text-accent-foreground',
            'disabled:cursor-default disabled:opacity-40',
          )}
        >
          {busy ? '…' : 'Create'}
        </button>
      </div>
    </div>
  );
}

// ── Plan badge ────────────────────────────────────────────────────────────────

/**
 * Per-workspace plan limits (mirrors backend/src/rate_limit/mod.rs). Kept
 * inlined here rather than fetched from the API because the values are
 * effectively constants — when they change in the backend we update both.
 */
export const PLAN_LIMITS: Record<WorkspacePlan, { uploadsPerHour: number; concurrentExports: number }> = {
  free: { uploadsPerHour: 5,   concurrentExports: 2  },
  pro:  { uploadsPerHour: 50,  concurrentExports: 10 },
  team: { uploadsPerHour: 200, concurrentExports: 30 },
};

const PLAN_STYLE: Record<WorkspacePlan, string> = {
  free: 'bg-surface-3 text-text-3',
  pro:  'bg-accent/15 text-accent',
  team: 'bg-amber-500/15 text-amber-300',
};

function PlanBadge({ plan, workspaceId }: { plan: WorkspacePlan; workspaceId?: string }) {
  // Only the topbar badge passes `workspaceId` — the per-row badges in the
  // dropdown stay static (no usage column needed when listing all workspaces).
  const { usage } = useWorkspaceUsage(workspaceId);
  const limits = PLAN_LIMITS[plan];

  // Prefer live numbers from /workspaces/:id/usage; fall back to static
  // limits when usage hasn't loaded yet (or running in mock mode).
  const tooltip = usage
    ? `Uploads: ${usage.uploads_used}/${usage.uploads_limit} this hour\n` +
      `Exports: ${usage.exports_concurrent_used}/${usage.exports_concurrent_limit} running` +
      (usage.uploads_reset_in_secs > 0
        ? `\nUpload window resets in ${formatResetIn(usage.uploads_reset_in_secs)}`
        : '')
    : `${limits.uploadsPerHour} uploads/hour · ${limits.concurrentExports} concurrent exports`;

  return (
    <span
      title={tooltip}
      className={cn(
        'rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider',
        PLAN_STYLE[plan],
      )}
    >
      {plan}
    </span>
  );
}

function formatResetIn(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function planLimitsLabel(plan: WorkspacePlan): string {
  const l = PLAN_LIMITS[plan];
  return `${l.uploadsPerHour}/h uploads · ${l.concurrentExports} exports`;
}
