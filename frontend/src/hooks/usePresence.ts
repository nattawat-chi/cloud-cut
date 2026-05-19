import { useCollabStore } from '@/state/collabStore';
import type { Collaborator } from '@/types';

/**
 * Returns the current list of collaborators and cursor map from the collab store.
 * Components use this instead of subscribing to collabStore directly.
 */
export function usePresence(): {
  collaborators: readonly Collaborator[];
  count: number;
} {
  const collaborators = useCollabStore((s) => s.collaborators);
  return { collaborators, count: collaborators.length };
}
