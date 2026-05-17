import { useEffect } from 'react';

import { useCollabStore } from '@/state/collabStore';
import { useHistoryStore } from '@/state/historyStore';
import { useUIStore } from '@/state/uiStore';
import type { CursorState, UUID } from '@/types';

/* =============================================================================
   CollabSimulator
   Returns null. Mounts a scripted "movie" of remote user cursors so the
   editor feels alive without a real backend. Phase 5 replaces this with a
   Pusher subscription that updates `collabStore` from real events.
   ============================================================================= */

interface ScriptStep {
  readonly whoId: UUID;
  readonly patch: Partial<CursorState>;
}

const SCRIPT: readonly ScriptStep[] = [
  { whoId: 'u_alice', patch: { target: 'viewport', x: 0.62, y: 0.42, editingClipId: null,  label: 'Alice K.' } },
  { whoId: 'u_mira',  patch: { target: 'timeline', timelineMs: 12500, editingClipId: 'c6', label: 'Mira S.'  } },
  { whoId: 'u_dev',   patch: { target: 'viewport', x: 0.45, y: 0.20, editingClipId: null,  label: 'Devon R.' } },

  { whoId: 'u_alice', patch: { target: 'viewport', x: 0.30, y: 0.50, editingClipId: null,  label: 'Alice K.' } },
  { whoId: 'u_mira',  patch: { target: 'timeline', timelineMs: 20800, editingClipId: 'c3', label: 'Mira S.'  } },

  { whoId: 'u_alice', patch: { target: 'timeline', timelineMs: 6700,  editingClipId: 'c2', label: 'Alice K.' } },
  { whoId: 'u_dev',   patch: { target: 'viewport', x: 0.78, y: 0.62, editingClipId: null,  label: 'Devon R.' } },

  { whoId: 'u_alice', patch: { target: 'timeline', timelineMs: 9200,  editingClipId: 'c2', label: 'Alice K.' } },
  { whoId: 'u_mira',  patch: { target: 'viewport', x: 0.18, y: 0.30, editingClipId: null,  label: 'Mira S.'  } },

  { whoId: 'u_alice', patch: { target: 'viewport', x: 0.74, y: 0.30, editingClipId: null,  label: 'Alice K.' } },
  { whoId: 'u_mira',  patch: { target: 'timeline', timelineMs: 4200,  editingClipId: 'c8', label: 'Mira S.'  } },
  { whoId: 'u_dev',   patch: { target: 'viewport', x: 0.55, y: 0.74, editingClipId: null,  label: 'Devon R.' } },
];

interface ToastSlot {
  readonly atStep: number;
  readonly who: string;
  readonly body: string;
}

const TOAST_SCRIPT: readonly ToastSlot[] = [
  { atStep: 4, who: 'Mira S.',  body: 'Moved demo_result.mp4 to 20.8s' },
  { atStep: 7, who: 'Alice K.', body: 'Updated brightness on feature_walkthrough.mp4' },
];

const TICK_MS = 3500;

export function CollabSimulator(): null {
  const showPresence = useUIStore((s) => s.showPresence);
  const setCursor = useCollabStore((s) => s.setCursor);
  const setAllVisible = useCollabStore((s) => s.setAllVisible);
  const toast = useHistoryStore((s) => s.toast);

  useEffect(() => {
    if (!showPresence) {
      setAllVisible(false);
      return;
    }
    setAllVisible(true);

    let i = 0;
    const tick = () => {
      const step = SCRIPT[i % SCRIPT.length];
      if (step) {
        setCursor(step.whoId, { ...step.patch, visible: true });
        const slot = TOAST_SCRIPT.find((t) => t.atStep === i % SCRIPT.length);
        if (slot) toast({ who: slot.who, body: slot.body });
      }
      i++;
    };

    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [showPresence, setCursor, setAllVisible, toast]);

  return null;
}
