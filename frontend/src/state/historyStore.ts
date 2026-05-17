import { create } from 'zustand';

import type { HistoryEntry, HistoryOpType, Toast } from '@/types';
import { MOCK_HISTORY } from '@/mocks/cloudcut';
import { uid } from '@/utils/id';

/* =============================================================================
   historyStore — undo/redo entries + transient toast stack.
   Phase 1.7 wires CommandManager which calls `push()` after every mutation;
   Phase 5 receives `push()` calls from Pusher event handlers too.
   ============================================================================= */

export interface HistoryState {
  entries: readonly HistoryEntry[];
  /** Index of the most-recently-executed entry. -1 means "nothing yet". */
  cursor: number;
  toasts: readonly Toast[];

  push: (entry: { type: HistoryOpType; desc: string; who?: string }) => void;
  undo: () => void;
  redo: () => void;
  jumpTo: (index: number) => void;

  toast: (toast: { who: string; body: string; durationMs?: number }) => void;
  dismissToast: (id: string) => void;
}

function stampNow(): string {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  entries: MOCK_HISTORY,
  cursor: MOCK_HISTORY.length - 1,
  toasts: [],

  push: (entry) =>
    set((s) => {
      // Branch the timeline: drop any "redoable" tail before appending,
      // and clear `undone` flags on entries that survive.
      const kept = s.entries
        .slice(0, s.cursor + 1)
        .map((e) => ({ ...e, undone: false }));
      const next: HistoryEntry = {
        id: uid('h'),
        type: entry.type,
        desc: entry.desc,
        ts: stampNow(),
        who: entry.who ?? 'You',
        undone: false,
      };
      const entries = [...kept, next];
      return { entries, cursor: entries.length - 1 };
    }),

  undo: () =>
    set((s) => {
      if (s.cursor < 0) return {};
      const entries = s.entries.map((e, i) =>
        i === s.cursor ? { ...e, undone: true } : e,
      );
      return { entries, cursor: s.cursor - 1 };
    }),

  redo: () =>
    set((s) => {
      if (s.cursor >= s.entries.length - 1) return {};
      const nextCursor = s.cursor + 1;
      const entries = s.entries.map((e, i) =>
        i === nextCursor ? { ...e, undone: false } : e,
      );
      return { entries, cursor: nextCursor };
    }),

  jumpTo: (index) =>
    set((s) => {
      const clamped = Math.max(-1, Math.min(s.entries.length - 1, index));
      const entries = s.entries.map((e, i) => ({ ...e, undone: i > clamped }));
      return { entries, cursor: clamped };
    }),

  toast: ({ who, body, durationMs = 4000 }) => {
    const id = uid('t');
    set((s) => ({
      toasts: [...s.toasts, { id, who, body, t: Date.now() }],
    }));
    // Auto-dismiss after `durationMs` — Phase 1.7's <ToastStack> animates out.
    setTimeout(() => {
      const { toasts } = get();
      if (toasts.some((tx) => tx.id === id)) {
        set({ toasts: toasts.filter((tx) => tx.id !== id) });
      }
    }, durationMs);
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((tx) => tx.id !== id) })),
}));

export const selectCanUndo = (s: HistoryState): boolean => s.cursor >= 0;
export const selectCanRedo = (s: HistoryState): boolean =>
  s.cursor < s.entries.length - 1;
