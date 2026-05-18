import { useEffect } from 'react';
import type { Channel } from 'pusher-js';

import { getPusher, isPusherEnabled } from '@/services/pusher';
import { useAuthStore } from '@/state/authStore';
import { useCollabStore } from '@/state/collabStore';
import { useHistoryStore } from '@/state/historyStore';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';

/* =============================================================================
   CollabClient
   Real-time multiplayer wiring:
     1. Subscribe to `presence-project-<id>` for the current project
     2. Mirror presence member set into collabStore
     3. Apply incoming op events to the local project store, skipping own ops
   No-op when Pusher env vars are missing (real-time disabled, single-user mode).
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
    readonly asset_id: string | null;
    readonly pos_ms: number;
    readonly dur_ms: number;
    readonly trim_in_ms?: number;
    readonly name: string;
  };
}

interface ClipDeletedPayload {
  readonly actor: string;
  readonly clip_id: string;
}

export function CollabClient(): null {
  useRealtime();
  return null;
}

function useRealtime(): void {
  const projectId = useProjectStore((s) => s.project?.id ?? null);
  const showPresence = useUIStore((s) => s.showPresence);
  const setCollaborators = useCollabStore((s) => s.setCollaborators);
  const addCollaborator = useCollabStore((s) => s.addCollaborator);
  const removeCollaborator = useCollabStore((s) => s.removeCollaborator);
  // Remote-op actions skip the API roundtrip — see projectStore.applyRemote*.
  // Wiring the user-facing moveClip / resizeClip / deleteClips here would
  // immediately re-PATCH the server, which re-publishes the same Pusher
  // event, which lands back here = ERR_INSUFFICIENT_RESOURCES infinite loop.
  const applyRemoteClipUpsert = useProjectStore((s) => s.applyRemoteClipUpsert);
  const applyRemoteClipDelete = useProjectStore((s) => s.applyRemoteClipDelete);
  const toast = useHistoryStore((s) => s.toast);

  useEffect(() => {
    // Visible breadcrumbs in the browser console — saves a tedious round of
    // "is Pusher actually on?" debugging when the avatar group stays empty.
    if (!isPusherEnabled()) {
      // eslint-disable-next-line no-console
      console.info(
        '[CollabClient] Pusher disabled — VITE_PUSHER_KEY missing. ' +
          'Add it to .env, then restart `pnpm dev` (Vite reads env at startup).',
      );
      return;
    }
    if (!projectId) return;
    if (!showPresence) return;

    const pusher = getPusher();
    if (!pusher) return;

    const channelName = `presence-project-${projectId}`;
    // eslint-disable-next-line no-console
    console.info('[CollabClient] subscribing to', channelName);
    const channel: Channel = pusher.subscribe(channelName);

    // Catch hard failures (bad key, signature mismatch, network) so the
    // user sees something concrete instead of a silently empty channel.
    channel.bind('pusher:subscription_error', (err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[CollabClient] subscription_error', err);
      toast({ who: 'CloudCut', body: 'Real-time sync failed — see console' });
    });

    // Helper: map Pusher member shape → our Collaborator type
    const mapMember = (m: PresenceMember) => {
      const name = m.info?.name ?? 'Anonymous';
      const initials = name
        .split(/\s+/)
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase();
      return {
        id: m.id,
        name,
        initials,
        color: pickColor(m.id),
      };
    };

    // ── Presence ──────────────────────────────────────────────────────────────
    channel.bind('pusher:subscription_succeeded', (members: {
      each: (cb: (m: PresenceMember) => void) => void;
    }) => {
      const list: ReturnType<typeof mapMember>[] = [];
      members.each((m) => list.push(mapMember(m)));
      setCollaborators(list);
      toast({ who: 'CloudCut', body: `Connected — ${list.length} editor(s) online` });
    });

    channel.bind('pusher:member_added', (m: PresenceMember) => {
      addCollaborator(mapMember(m));
      toast({ who: 'CloudCut', body: `${m.info?.name ?? 'Someone'} joined` });
    });

    channel.bind('pusher:member_removed', (m: PresenceMember) => {
      removeCollaborator(m.id);
      toast({ who: 'CloudCut', body: `${m.info?.name ?? 'Someone'} left` });
    });

    // ── Op events (apply remote edits) ────────────────────────────────────────
    // Pull the real user id off the auth store at event time. We were
    // previously comparing payload.actor to a static VITE_USER_ID env var
    // which was always empty - so every echo of our own action got applied
    // back, triggering another PATCH, triggering another event, and so on.
    const isOwnAction = (actor: string) =>
      actor === useAuthStore.getState().user?.id;

    channel.bind('clip:added', (payload: ClipUpdatedPayload) => {
      if (isOwnAction(payload.actor)) return;
      applyRemoteClipUpsert(payload.clip);
    });

    channel.bind('clip:updated', (payload: ClipUpdatedPayload) => {
      if (isOwnAction(payload.actor)) return;
      applyRemoteClipUpsert(payload.clip);
    });

    channel.bind('clip:deleted', (payload: ClipDeletedPayload) => {
      if (isOwnAction(payload.actor)) return;
      applyRemoteClipDelete(payload.clip_id);
    });

    return () => {
      pusher.unsubscribe(channelName);
      setCollaborators([]);
    };
  }, [
    projectId,
    showPresence,
    setCollaborators,
    addCollaborator,
    removeCollaborator,
    applyRemoteClipUpsert,
    applyRemoteClipDelete,
    toast,
  ]);
}

// Stable per-user colour from a short hash so the same person always gets
// the same avatar tint across sessions.
function pickColor(id: string): string {
  const palette = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'];
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return palette[Math.abs(h) % palette.length]!;
}
