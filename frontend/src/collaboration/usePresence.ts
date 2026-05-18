/* =============================================================================
   usePresence — `presence-project-{projectId}` subscription.
   Mirrors the presence-channel events listed in §4.2 of the spec:

     member_added         · server-side
     member_removed       · server-side
     client-cursor-move   · client-triggered (throttle ~50–100ms)
     client-editing-clip  · client-triggered

   The hook owns three responsibilities:
     1. subscribe / unsubscribe to the project's presence channel
     2. push remote cursors into the collabStore so RemoteCursors can render them
     3. expose a `broadcastCursor` callback that throttles client events
   ============================================================================= */

import { useCallback, useEffect, useRef } from 'react';

import type { ChannelLike, PusherLike } from './usePusher';
import { useCollabStore } from '@/state/collabStore';
import type { UUID } from '@/types';

const CURSOR_THROTTLE_MS = 80;

export interface PresenceMemberEvent {
  userId: UUID;
  name:   string;
}

export interface CursorMovePayload {
  userId:        UUID;
  currentTimeMs?: number;
  activeTrackId?: UUID;
  activeClipId?:  UUID;
  /** Optional viewport coords (ratios 0–1) for cursor overlays. */
  x?: number;
  y?: number;
}

export interface UsePresenceArgs {
  pusher:    PusherLike | null;
  projectId: UUID | null;
}

export interface UsePresenceResult {
  broadcastCursor: (payload: Omit<CursorMovePayload, 'userId'>) => void;
}

export function usePresence({ pusher, projectId }: UsePresenceArgs): UsePresenceResult {
  const channelRef     = useRef<ChannelLike | null>(null);
  const lastBroadcast  = useRef(0);
  const setCursor      = useCollabStore((s) => s.setCursor);

  useEffect(() => {
    if (!pusher || !projectId) return;

    const channel = pusher.subscribe(`presence-project-${projectId}`);
    channelRef.current = channel;

    const onMemberAdded   = (data: unknown) => {
      // Phase 5: parse PresenceMemberEvent and add to collaborators store.
      void data;
    };
    const onMemberRemoved = (data: unknown) => { void data; };
    const onCursorMove    = (data: unknown) => {
      const c = data as CursorMovePayload | null;
      if (!c?.userId) return;
      setCursor(c.userId, {
        timelineMs:    c.currentTimeMs,
        x:             c.x,
        y:             c.y,
        editingClipId: c.activeClipId ?? null,
      });
    };

    channel.bind('member_added',       onMemberAdded);
    channel.bind('member_removed',     onMemberRemoved);
    channel.bind('client-cursor-move', onCursorMove);

    return () => {
      channel.unbind('member_added',       onMemberAdded);
      channel.unbind('member_removed',     onMemberRemoved);
      channel.unbind('client-cursor-move', onCursorMove);
      pusher.unsubscribe(`presence-project-${projectId}`);
      channelRef.current = null;
    };
  }, [pusher, projectId, setCursor]);

  const broadcastCursor = useCallback((payload: Omit<CursorMovePayload, 'userId'>) => {
    const now = Date.now();
    if (now - lastBroadcast.current < CURSOR_THROTTLE_MS) return;
    lastBroadcast.current = now;
    channelRef.current?.trigger?.('client-cursor-move', payload);
  }, []);

  return { broadcastCursor };
}
