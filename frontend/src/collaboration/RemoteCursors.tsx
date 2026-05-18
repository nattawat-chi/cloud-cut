/* =============================================================================
   RemoteCursors — overlay of every other collaborator's live cursor.

   Reads from `collabStore.cursors` so this stays a pure render component:
     - Pusher events feed the store (see usePresence)
     - Store flushes a render
     - This component draws a coloured dot + label per visible cursor

   The store already supports two cursor *targets*:
     - 'viewport'  → x/y are 0–1 ratios over the player surface
     - 'timeline'  → timelineMs is a position on the timeline

   This component only renders the viewport variant (timeline cursors are
   drawn by `<Timeline>` itself).
   ============================================================================= */

import { memo } from 'react';

import { useCollabStore } from '@/state/collabStore';
import type { Collaborator, UUID } from '@/types';

interface RemoteCursorsProps {
  /** Suppress the local user's own cursor from the overlay. */
  selfUserId?: UUID | null;
}

export const RemoteCursors = memo(function RemoteCursors({
  selfUserId = null,
}: RemoteCursorsProps) {
  const cursors       = useCollabStore((s) => s.cursors);
  const collaborators = useCollabStore((s) => s.collaborators);
  const byId          = collaboratorMap(collaborators);

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {Object.entries(cursors).map(([userId, c]) => {
        if (userId === selfUserId)         return null;
        if (!c.visible)                    return null;
        if (c.target !== 'viewport')       return null;
        if (c.x === undefined || c.y === undefined) return null;

        const collab = byId.get(userId);
        const color  = collab?.color ?? 'var(--collab-fallback)';
        const label  = collab?.name  ?? c.label ?? userId;

        return (
          <div
            key={userId}
            className="absolute -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-100"
            style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
          >
            <span
              className="block size-3 rounded-full border-2 border-background shadow"
              style={{ backgroundColor: color }}
              aria-hidden
            />
            <span
              className="ml-3 -mt-1 inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium text-white shadow"
              style={{ backgroundColor: color }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
});

function collaboratorMap(list: readonly Collaborator[]): Map<UUID, Collaborator> {
  const m = new Map<UUID, Collaborator>();
  for (const c of list) m.set(c.id, c);
  return m;
}
