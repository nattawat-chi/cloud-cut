import type React from 'react';
import { useEffect } from 'react';
import type { Channel } from 'pusher-js';

import { getPusher, isPusherEnabled } from '@/services/pusher';
import { useCollabStore } from '@/state/collabStore';
import { useHistoryStore } from '@/state/historyStore';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import { CollabSimulator } from './CollabSimulator';

/* =============================================================================
   CollabClient
   Real-time multiplayer wiring:
     1. Subscribe to `presence-project-<id>` for the current project
     2. Mirror presence member set into collabStore
     3. Apply incoming op events to the local project store, skipping own ops
   Falls back to CollabSimulator when Pusher isn't configured (dev mode).
   ============================================================================= */

interface PresenceMember {
  readonly id: string;
  readonly info?: { name?: string; avatar_url?: string | null };
}

interface ClipUpdatedPayload {
  readonly actor: string;
  readonly clip: {
    readonly id: string;
    readonly track_id: string;
    readonly pos_ms: number;
    readonly dur_ms: number;
    readonly name: string;
  };
}

interface ClipDeletedPayload {
  readonly actor: string;
  readonly clip_id: string;
}

export function CollabClient(): React.ReactElement | null {
  // useRealtime is always called so hook order is stable; it no-ops without Pusher.
  useRealtime();

  // Fall back to the scripted simulator for dev environments without Pusher creds.
  return isPusherEnabled() ? null : <CollabSimulator />;
}

function useRealtime(): void {
  const projectId = useProjectStore((s) => s.project?.id ?? null);
  const showPresence = useUIStore((s) => s.showPresence);
  const setAllVisible = useCollabStore((s) => s.setAllVisible);
  const moveClipLocal = useProjectStore((s) => s.moveClip);
  const resizeClipLocal = useProjectStore((s) => s.resizeClip);
  const deleteClipsLocal = useProjectStore((s) => s.deleteClips);
  const toast = useHistoryStore((s) => s.toast);

  useEffect(() => {
    if (!isPusherEnabled()) return;
    if (!projectId) return;
    if (!showPresence) {
      setAllVisible(false);
      return;
    }

    const pusher = getPusher();
    if (!pusher) return;

    const channelName = `presence-project-${projectId}`;
    const channel: Channel = pusher.subscribe(channelName);

    // ── Presence ──────────────────────────────────────────────────────────────
    channel.bind('pusher:subscription_succeeded', (members: { each: (cb: (m: PresenceMember) => void) => void }) => {
      const seen: string[] = [];
      members.each((m) => seen.push(m.info?.name ?? m.id));
      // Lightweight feedback that we're connected
      toast({ who: 'CloudCut', body: `Connected — ${seen.length} editor(s) online` });
    });

    channel.bind('pusher:member_added', (member: PresenceMember) => {
      toast({ who: 'CloudCut', body: `${member.info?.name ?? 'Someone'} joined` });
    });

    channel.bind('pusher:member_removed', (member: PresenceMember) => {
      toast({ who: 'CloudCut', body: `${member.info?.name ?? 'Someone'} left` });
    });

    // ── Op events (apply remote edits) ────────────────────────────────────────
    channel.bind('clip:updated', (payload: ClipUpdatedPayload) => {
      // Skip our own ops — local store is already authoritative
      const myId = (import.meta.env.VITE_USER_ID as string | undefined) ?? '';
      if (payload.actor === myId) return;
      // Apply move + resize from server-canonical values
      moveClipLocal(payload.clip.id, payload.clip.pos_ms, payload.clip.track_id);
      resizeClipLocal(payload.clip.id, payload.clip.pos_ms, payload.clip.dur_ms);
    });

    channel.bind('clip:deleted', (payload: ClipDeletedPayload) => {
      const myId = (import.meta.env.VITE_USER_ID as string | undefined) ?? '';
      if (payload.actor === myId) return;
      deleteClipsLocal([payload.clip_id]);
    });

    return () => {
      pusher.unsubscribe(channelName);
    };
  }, [
    projectId,
    showPresence,
    setAllVisible,
    moveClipLocal,
    resizeClipLocal,
    deleteClipsLocal,
    toast,
  ]);
}
