import { create } from 'zustand';

import type { Collaborator, CursorState, UUID } from '@/types';

/* =============================================================================
   collabStore — presence + remote cursors.
   Hydrated by `CollabClient` from Pusher presence events. Stays empty in
   single-user mode (no Pusher creds, no second collaborator).
   ============================================================================= */

export interface CollabState {
  collaborators: readonly Collaborator[];
  /** Keyed by user id. */
  cursors: Readonly<Record<UUID, CursorState>>;

  setCursor: (userId: UUID, patch: Partial<CursorState>) => void;
  setAllVisible: (visible: boolean) => void;

  /** Replace the full member list — called from Pusher subscription_succeeded. */
  setCollaborators: (members: readonly Collaborator[]) => void;
  /** Add a single member (member_added event). */
  addCollaborator: (member: Collaborator) => void;
  /** Remove a member by id (member_removed event). */
  removeCollaborator: (userId: UUID) => void;
}

export const useCollabStore = create<CollabState>()((set) => ({
  collaborators: [],
  cursors: {},

  setCursor: (userId, patch) =>
    set((s) => {
      const existing = s.cursors[userId];
      const next: CursorState = existing
        ? { ...existing, ...patch }
        : {
            target: patch.target ?? 'viewport',
            visible: patch.visible ?? true,
            label: patch.label ?? userId,
            editingClipId: patch.editingClipId ?? null,
            x: patch.x,
            y: patch.y,
            timelineMs: patch.timelineMs,
          };
      return { cursors: { ...s.cursors, [userId]: next } };
    }),

  setAllVisible: (visible) =>
    set((s) => {
      const next: Record<UUID, CursorState> = {};
      for (const [k, v] of Object.entries(s.cursors)) {
        next[k] = { ...v, visible };
      }
      return { cursors: next };
    }),

  setCollaborators: (members) => set({ collaborators: members }),

  addCollaborator: (member) =>
    set((s) =>
      s.collaborators.some((c) => c.id === member.id)
        ? {}
        : { collaborators: [...s.collaborators, member] },
    ),

  removeCollaborator: (userId) =>
    set((s) => {
      const cursors = { ...s.cursors };
      delete cursors[userId];
      return {
        collaborators: s.collaborators.filter((c) => c.id !== userId),
        cursors,
      };
    }),
}));
