/**
 * useOperationSync — binds Pusher op-event handlers to the project store.
 *
 * Listens on the presence channel for clip:added / clip:updated /
 * clip:deleted / clip:split events and applies them to the local
 * projectStore, skipping events emitted by the current user to
 * avoid infinite echo loops.
 *
 * Must be called AFTER the presence channel is subscribed (i.e. inside
 * CollaboratorList, after usePresence has run for the same projectId).
 */

import { useEffect } from 'react';

import { getPusher, isPusherEnabled } from '@/services/pusher';
import { useAuthStore } from '@/state/authStore';
import { useProjectStore } from '@/state/projectStore';

// ─── Payload shapes (mirror backend timeline/handlers.rs) ─────────────────────

interface RemoteClip {
  readonly id: string;
  readonly track_id: string;
  readonly asset_id: string | null;
  readonly pos_ms: number;
  readonly dur_ms: number;
  readonly trim_in_ms?: number;
  readonly name: string;
}

interface ClipUpsertPayload {
  readonly actor: string;
  readonly clip: RemoteClip;
}

interface ClipDeletePayload {
  readonly actor: string;
  readonly clip_id: string;
}

interface ClipSplitPayload {
  readonly actor: string;
  /** Backend returns [leftUpdated, rightNew] after a split. */
  readonly clips: readonly RemoteClip[];
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOperationSync(projectId: string | null): void {
  const applyRemoteClipUpsert = useProjectStore((s) => s.applyRemoteClipUpsert);
  const applyRemoteClipDelete = useProjectStore((s) => s.applyRemoteClipDelete);

  useEffect(() => {
    if (!isPusherEnabled() || !projectId) return;

    const pusher = getPusher();
    if (!pusher) return;

    const channelName = `presence-project-${projectId}`;
    const channel = pusher.channel(channelName);

    // If the channel isn't subscribed yet (usePresence runs concurrently),
    // wait until subscription_succeeded before binding op handlers.
    if (!channel) return;

    /** Skip events that originated from this browser tab to prevent echo loops. */
    const isOwnAction = (actor: string): boolean =>
      actor === useAuthStore.getState().user?.id;

    const onClipAdded = (p: ClipUpsertPayload) => {
      if (isOwnAction(p.actor)) return;
      applyRemoteClipUpsert(p.clip);
    };

    const onClipUpdated = (p: ClipUpsertPayload) => {
      if (isOwnAction(p.actor)) return;
      applyRemoteClipUpsert(p.clip);
    };

    const onClipDeleted = (p: ClipDeletePayload) => {
      if (isOwnAction(p.actor)) return;
      applyRemoteClipDelete(p.clip_id);
    };

    const onClipSplit = (p: ClipSplitPayload) => {
      if (isOwnAction(p.actor)) return;
      for (const c of p.clips) applyRemoteClipUpsert(c);
    };

    channel.bind('clip:added',   onClipAdded);
    channel.bind('clip:updated', onClipUpdated);
    channel.bind('clip:deleted', onClipDeleted);
    channel.bind('clip:split',   onClipSplit);

    return () => {
      channel.unbind('clip:added',   onClipAdded);
      channel.unbind('clip:updated', onClipUpdated);
      channel.unbind('clip:deleted', onClipDeleted);
      channel.unbind('clip:split',   onClipSplit);
    };
  }, [projectId, applyRemoteClipUpsert, applyRemoteClipDelete]);
}
