import { cn } from '@/lib/utils';
import { useAuthStore } from '@/state/authStore';
import { useCollabStore } from '@/state/collabStore';
import type { CursorState, UUID } from '@/types';

/**
 * Stacked presence avatars — collaborators on the left, "You" on the right
 * with an accent border. An animated ring (powered by the
 * `cc-presence-pulse` keyframe in index.css) wraps a collaborator while they
 * have a clip selected.
 */
export function Presence() {
  const collaborators = useCollabStore((s) => s.collaborators);
  const cursors = useCollabStore((s) => s.cursors);
  const user = useAuthStore((s) => s.user);

  // The collaborators list from Pusher *includes* the local user; filter
  // them out so the "You" avatar isn't duplicated.
  const others = user ? collaborators.filter((c) => c.id !== user.id) : collaborators;

  const youInitials = user
    ? (user.display_name || user.email)
        .split(/\s+|@/)
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'YU';

  return (
    <div className="flex items-center">
      {others.map((c, i) => {
        const editing = isUserEditing(c.name, cursors);
        return (
          <Avatar
            key={c.id}
            initials={c.initials}
            color={c.color}
            label={c.name + (editing ? ' · editing' : '')}
            editing={editing}
            stack={i > 0}
          />
        );
      })}
      <Avatar
        initials={youInitials}
        label="You"
        isYou
        stack={others.length > 0}
      />
    </div>
  );
}

interface AvatarProps {
  initials: string;
  color?: string;
  label: string;
  editing?: boolean;
  isYou?: boolean;
  stack?: boolean;
}

function Avatar({ initials, color, label, editing, isYou, stack }: AvatarProps) {
  return (
    <div
      title={label}
      className={cn(
        'relative grid h-[26px] w-[26px] place-items-center rounded-full',
        'border-2 border-surface-1 text-[11px] font-semibold tracking-[0.02em] text-white',
        stack && '-ml-1.5',
        isYou && '!border-accent bg-surface-3 text-text-1',
      )}
      style={!isYou && color ? { background: color } : undefined}
    >
      {initials}
      {editing && (
        <span
          className="pointer-events-none absolute -inset-[3px] rounded-full border-[1.5px]"
          style={{
            borderColor: color ?? 'var(--accent)',
            animation: 'var(--animate-cc-presence-pulse)',
          }}
        />
      )}
    </div>
  );
}

function isUserEditing(
  name: string,
  cursors: Readonly<Record<UUID, CursorState>>,
): boolean {
  for (const c of Object.values(cursors)) {
    if (c.label === name && c.editingClipId != null) return true;
  }
  return false;
}
