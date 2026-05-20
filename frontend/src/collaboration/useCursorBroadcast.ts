/**
 * useCursorBroadcast — sends the local user's timeline cursor and playhead
 * position to other collaborators via Pusher client events.
 *
 * Uses `client-*` events (peer-to-peer through Pusher, no server round-trip)
 * so mouse-move latency stays low. Requires "Client events" to be enabled in
 * the Pusher app dashboard; silently no-ops if the feature is off.
 *
 * Returns DOM event handlers to attach to the `.tl-inner` div.
 */

import { useCallback, useEffect, useRef } from 'react';

import { getPusher, isPusherEnabled } from '@/services/pusher';
import { useAuthStore } from '@/state/authStore';
import { usePlaybackStore } from '@/state/playbackStore';
import { useProjectStore } from '@/state/projectStore';
import { pxToMs } from '@/utils/geometry';

export function useCursorBroadcast(zoomLevel: number) {
  const projectId = useProjectStore((s) => s.project?.id ?? null);
  const currentTimeMs = usePlaybackStore((s) => s.currentTimeMs);

  const cursorThrottleRef  = useRef(0);
  const playheadThrottleRef = useRef(0);
  const lastPlayheadRef    = useRef(-1);

  const getChannel = useCallback(() => {
    if (!isPusherEnabled() || !projectId) return null;
    const pusher = getPusher();
    if (!pusher) return null;
    return pusher.channel(`presence-project-${projectId}`) ?? null;
  }, [projectId]);

  // ── Cursor position broadcast ─────────────────────────────────────────────

  const broadcastCursor = useCallback(
    (timelineMs: number | null) => {
      const now = Date.now();
      if (now - cursorThrottleRef.current < 80) return; // ~12 fps max
      cursorThrottleRef.current = now;

      const ch = getChannel();
      if (!ch) return;

      const user = useAuthStore.getState().user;
      if (!user) return;

      try {
        ch.trigger('client-cursor:move', {
          userId: user.id,
          timelineMs,
          visible: timelineMs !== null,
        });
      } catch {
        // Silently ignore — client events require "Client events" enabled in
        // the Pusher app dashboard. The feature gracefully degrades.
      }
    },
    [getChannel],
  );

  const onTimelineMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ms = Math.max(0, pxToMs(e.clientX - rect.left, zoomLevel));
      broadcastCursor(ms);
    },
    [broadcastCursor, zoomLevel],
  );

  const onTimelineMouseLeave = useCallback(() => {
    broadcastCursor(null);
  }, [broadcastCursor]);

  // ── Playhead broadcast ────────────────────────────────────────────────────
  // Fires when currentTimeMs changes with two guards:
  //   1. 500 ms time throttle to cap Pusher event rate
  //   2. 200 ms minimum change so tiny float drift doesn't flood the channel

  useEffect(() => {
    const now = Date.now();
    const timeSince = now - playheadThrottleRef.current;
    const msDelta   = Math.abs(currentTimeMs - lastPlayheadRef.current);

    if (timeSince < 500 && msDelta < 200) return;

    playheadThrottleRef.current = now;
    lastPlayheadRef.current     = currentTimeMs;

    const ch = getChannel();
    if (!ch) return;

    const user = useAuthStore.getState().user;
    if (!user) return;

    try {
      ch.trigger('client-playhead:seek', {
        userId:     user.id,
        playheadMs: currentTimeMs,
      });
    } catch {
      // same as above — degrades gracefully
    }
  }, [currentTimeMs, getChannel]);

  return { onTimelineMouseMove, onTimelineMouseLeave };
}
