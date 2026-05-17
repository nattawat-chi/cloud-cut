import { create } from 'zustand';

import type { Collaborator, CursorState, UUID } from '@/types';
import { MOCK_COLLABORATORS } from '@/mocks/cloudcut';

/* =============================================================================
   collabStore — presence + remote cursors.
   Phase 1.7 drives this with a scripted simulator (`CollabSimulator`).
   Phase 5 replaces the simulator with a Pusher subscription.
   ============================================================================= */

export interface CollabState {
  collaborators: readonly Collaborator[];
  /** Keyed by user id. */
  cursors: Readonly<Record<UUID, CursorState>>;

  setCursor: (userId: UUID, patch: Partial<CursorState>) => void;
  setAllVisible: (visible: boolean) => void;
}

const INITIAL_CURSORS: Record<UUID, CursorState> = {
  u_alice: { target: 'viewport', x: 0.65, y: 0.55, visible: true,  label: 'Alice K.', editingClipId: null },
  u_mira:  { target: 'timeline', timelineMs: 12500, visible: true, label: 'Mira S.',  editingClipId: 'c6' },
  u_dev:   { target: 'viewport', x: 0.45, y: 0.18, visible: true,  label: 'Devon R.', editingClipId: null },
};

export const useCollabStore = create<CollabState>()((set) => ({
  collaborators: MOCK_COLLABORATORS,
  cursors: INITIAL_CURSORS,

  setCursor: (userId, patch) =>
    set((s) => {
      const existing = s.cursors[userId];
      if (!existing) return {};
      return { cursors: { ...s.cursors, [userId]: { ...existing, ...patch } } };
    }),

  setAllVisible: (visible) =>
    set((s) => {
      const next: Record<UUID, CursorState> = {};
      for (const [k, v] of Object.entries(s.cursors)) {
        next[k] = { ...v, visible };
      }
      return { cursors: next };
    }),
}));
