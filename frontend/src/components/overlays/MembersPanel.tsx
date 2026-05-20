import { useEffect, useState } from 'react';
import { MailIcon, ShieldIcon, Trash2Icon, UserPlusIcon, XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';
import { ApiError, workspaces as workspacesApi, type WorkspaceMember } from '@/services/api';
import { useAuthStore } from '@/state/authStore';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';

const ROLE_ORDER = ['owner', 'admin', 'editor', 'viewer'] as const;
type Role = typeof ROLE_ORDER[number];

const ROLE_LABEL: Record<Role, string> = {
  owner:  'Owner',
  admin:  'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

const ROLE_COLOR: Record<Role, string> = {
  owner:  'bg-amber-500/15 text-amber-400',
  admin:  'bg-purple-500/15 text-purple-400',
  editor: 'bg-accent/15 text-accent',
  viewer: 'bg-surface-3 text-text-3',
};

function RoleBadge({ role }: { role: string }) {
  const r = (ROLE_ORDER.includes(role as Role) ? role : 'viewer') as Role;
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', ROLE_COLOR[r])}>
      {ROLE_LABEL[r]}
    </span>
  );
}

function Initials({ name, email }: { name: string; email: string }) {
  const src = name || email;
  const letters = src
    .split(/\s+|@/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-text-1">
      {letters || '?'}
    </div>
  );
}

export function MembersPanel() {
  const open = useUIStore((s) => s.showMembersPanel);
  const toggle = useUIStore((s) => s.toggleMembersPanel);
  const workspaceId = useProjectStore((s) => s.project?.workspace ?? null);
  const me = useAuthStore((s) => s.user);
  const { canInvite, canManageMembers } = usePermissions();

  const [members, setMembers]     = useState<WorkspaceMember[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole]   = useState<'admin' | 'editor' | 'viewer'>('editor');
  const [inviting, setInviting]   = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  const load = () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    workspacesApi
      .listMembers(workspaceId)
      .then(setMembers)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Failed to load members'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspaceId]);

  const handleInvite = async () => {
    if (!workspaceId || !inviteEmail.trim()) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      await workspacesApi.invite(workspaceId, inviteEmail.trim(), inviteRole);
      setInviteMsg(`Invitation sent to ${inviteEmail.trim()}`);
      setInviteEmail('');
      load();
    } catch (e: unknown) {
      setInviteMsg(e instanceof ApiError ? e.message : 'Failed to send invitation');
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    if (!workspaceId) return;
    try {
      await workspacesApi.updateRole(workspaceId, userId, role);
      setMembers((prev) =>
        prev.map((m) => (m.user_id === userId ? { ...m, role } : m)),
      );
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : 'Failed to update role');
    }
  };

  const handleRemove = async (userId: string) => {
    if (!workspaceId) return;
    try {
      await workspacesApi.removeMember(workspaceId, userId);
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : 'Failed to remove member');
    }
  };

  if (!open) return null;

  return (
    <div
      className={cn(
        'fixed right-3.5 top-14 z-[50] flex max-h-[520px] w-[340px] flex-col overflow-hidden',
        'rounded-lg border border-line bg-surface-1 shadow-xl',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <ShieldIcon size={12} className="text-text-3" /> Members
        </span>
        <button
          type="button"
          title="Close"
          onClick={toggle}
          className="grid h-5 w-5 place-items-center rounded text-text-3 hover:bg-surface-3 hover:text-text-1"
        >
          <XIcon size={11} />
        </button>
      </div>

      {/* Invite form — admin+ only */}
      {canInvite && (
        <div className="border-b border-line px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-1.5 text-[10.5px] font-medium text-text-3">
            <UserPlusIcon size={11} /> Invite member
          </div>
          <div className="flex gap-1.5">
            <input
              type="email"
              placeholder="email@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleInvite()}
              className={cn(
                'min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2 py-1',
                'text-xs text-text-1 placeholder:text-text-4',
                'focus:border-accent focus:outline-none',
              )}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
              className="rounded-md border border-line bg-surface-2 px-1.5 py-1 text-xs text-text-1"
            >
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => void handleInvite()}
            disabled={inviting || !inviteEmail.trim()}
            className={cn(
              'flex w-full items-center justify-center gap-1.5 rounded-md bg-accent py-1.5',
              'text-xs font-semibold text-accent-foreground hover:brightness-105',
              'disabled:cursor-default disabled:opacity-40',
            )}
          >
            <MailIcon size={11} /> {inviting ? 'Sending…' : 'Send invitation'}
          </button>
          {inviteMsg && (
            <p className="text-[10px] text-text-3">{inviteMsg}</p>
          )}
        </div>
      )}

      {/* Member list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="py-8 text-center text-[11px] text-text-4">Loading…</div>
        )}
        {error && (
          <div className="px-3 py-3 text-[11px] text-red-400">{error}</div>
        )}
        {!loading && !error && members.map((m) => {
          const isMe = m.user_id === me?.id;
          const isOwner = m.role === 'owner';
          const canModify = canManageMembers && !isMe && !isOwner;

          return (
            <div
              key={m.user_id}
              className="flex items-center gap-2.5 border-b border-line/50 px-3 py-2.5 last:border-0"
            >
              <Initials name={m.display_name} email={m.email} />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-medium text-text-1">
                    {m.display_name}
                  </span>
                  {isMe && (
                    <span className="shrink-0 text-[9px] text-text-4">(you)</span>
                  )}
                </div>
                <div className="truncate text-[10px] text-text-3">{m.email}</div>
              </div>

              {/* Role — dropdown for admin+, badge for others */}
              {canModify ? (
                <select
                  value={m.role}
                  onChange={(e) => void handleRoleChange(m.user_id, e.target.value)}
                  className="rounded border border-line bg-surface-2 px-1 py-0.5 text-[10px] text-text-1"
                >
                  <option value="admin">Admin</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              ) : (
                <RoleBadge role={m.role} />
              )}

              {/* Remove button */}
              {canModify && (
                <button
                  type="button"
                  title="Remove member"
                  onClick={() => void handleRemove(m.user_id)}
                  className="grid h-5 w-5 shrink-0 place-items-center rounded text-text-4 hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2Icon size={11} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
