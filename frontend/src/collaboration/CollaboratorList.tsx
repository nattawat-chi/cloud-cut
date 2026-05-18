/* =============================================================================
   CollaboratorList — stacked avatar row of active collaborators.

   Designed to live in the top bar next to the project name.  Renders directly
   from `collabStore.collaborators` so the Pusher presence hook only needs to
   keep that list fresh.
   ============================================================================= */

import { memo } from 'react';

import { useCollabStore } from '@/state/collabStore';
import type { Collaborator } from '@/types';

interface CollaboratorListProps {
  /** Hard cap on avatars before collapsing into a `+N` chip. */
  maxAvatars?: number;
  className?:   string;
}

export const CollaboratorList = memo(function CollaboratorList({
  maxAvatars = 4,
  className  = '',
}: CollaboratorListProps) {
  const collaborators = useCollabStore((s) => s.collaborators);
  if (collaborators.length === 0) return null;

  const shown    = collaborators.slice(0, maxAvatars);
  const overflow = collaborators.length - shown.length;

  return (
    <div
      className={`flex items-center -space-x-2 ${className}`}
      aria-label={`${collaborators.length} collaborators online`}
    >
      {shown.map((c) => <Avatar key={c.id} collaborator={c} />)}
      {overflow > 0 && (
        <span
          className="z-10 inline-flex size-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[11px] font-semibold text-muted-foreground"
          aria-hidden
        >
          +{overflow}
        </span>
      )}
    </div>
  );
});

function Avatar({ collaborator }: { collaborator: Collaborator }) {
  return (
    <span
      className="inline-flex size-7 items-center justify-center rounded-full border-2 border-background text-[11px] font-semibold text-white shadow"
      style={{ backgroundColor: collaborator.color }}
      title={collaborator.name}
    >
      {collaborator.initials}
    </span>
  );
}
