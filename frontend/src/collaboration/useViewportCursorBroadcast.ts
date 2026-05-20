/**
 * useViewportCursorBroadcast — broadcasts the local user's mouse position
 * over the preview/viewport area as 0..1 normalised x/y ratios so collaborators
 * see a Figma-style floating cursor on top of the video preview.
 *
 * Pairs with `RemoteCursors` (display) and the `client-cursor:viewport`
 * binding in `useOperationSync` (receive). Uses Pusher client events so
 * cursor traffic stays peer-to-peer — never hits the backend.
 *
 * Returns DOM event handlers to attach to the preview container.
 */

import { useCallback, useRef } from 'react';

import { getPusher, isPusherEnabled } from '@/services/pusher';
import { useAuthStore } from '@/state/authStore';
import { useProjectStore } from '@/state/projectStore';

export interface UseViewportCursorBroadcastResult {
  onMouseMove: (e: React.MouseEvent<HTMLElement>) => void;
  onMouseLeave: () => void;
}

export function useViewportCursorBroadcast(): UseViewportCursorBroadcastResult {
  const projectId = useProjectStore((s) => s.project?.id ?? null);
  const throttleRef = useRef(0);

  const broadcast = useCallback(
    (x: number | null, y: number | null) => {
      // ~16 fps cap — enough for smooth feel, well under Pusher's client-event
      // rate limit (10/s/connection on the free tier).
      const now = Date.now();
      if (now - throttleRef.current < 60) return;
      throttleRef.current = now;

      if (!isPusherEnabled() || !projectId) return;
      const pusher = getPusher();
      if (!pusher) return;
      const ch = pusher.channel(`presence-project-${projectId}`);
      if (!ch) return;

      const user = useAuthStore.getState().user;
      if (!user) return;

      try {
        ch.trigger('client-cursor:viewport', {
          userId: user.id,
          x,
          y,
          visible: x !== null && y !== null,
        });
      } catch {
        // Silent — `client-*` events require "Client events" toggled on in the
        // Pusher dashboard. Without it the broadcast is a no-op but the editor
        // still works for the local user.
      }
    },
    [projectId],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      broadcast(x, y);
    },
    [broadcast],
  );

  const onMouseLeave = useCallback(() => broadcast(null, null), [broadcast]);

  return { onMouseMove, onMouseLeave };
}
