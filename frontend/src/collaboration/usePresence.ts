/**
 * usePresence — subscribes to a Pusher presence channel and keeps
 * collabStore in sync with the live member list.
 *
 * Call this once per active project (inside CollaboratorList).
 */

import { useEffect } from 'react';
import type { Channel } from 'pusher-js';

import { getPusher, isPusherEnabled } from '@/services/pusher';
import { useCollabStore } from '@/state/collabStore';
import { useHistoryStore } from '@/state/historyStore';
import type { Collaborator } from '@/types';

interface PresenceMember {
  readonly id: string;
  readonly info?: { name?: string; avatar_url?: string | null };
}

/** Stable per-user colour derived from a short hash. */
function pickColor(id: string): string {
  const palette = [
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#06b6d4', '#3b82f6', '#a855f7', '#ec4899',
  ];
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return palette[Math.abs(h) % palette.length]!;
}

function mapMember(m: PresenceMember): Collaborator {
  const name = m.info?.name ?? 'Anonymous';
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return { id: m.id, name, initials, color: pickColor(m.id) };
}

export interface UsePresenceResult {
  /** Current live count of editors on this project. */
  count: number;
}

export function usePresence(projectId: string | null): UsePresenceResult {
  const setCollaborators = useCollabStore((s) => s.setCollaborators);
  const addCollaborator  = useCollabStore((s) => s.addCollaborator);
  const removeCollaborator = useCollabStore((s) => s.removeCollaborator);
  const collaborators    = useCollabStore((s) => s.collaborators);
  const toast            = useHistoryStore((s) => s.toast);

  useEffect(() => {
    if (!isPusherEnabled() || !projectId) return;

    const pusher = getPusher();
    if (!pusher) return;

    const channelName = `presence-project-${projectId}`;
    const channel: Channel = pusher.subscribe(channelName);

    channel.bind('pusher:subscription_error', (err: unknown) => {
      console.error('[usePresence] subscription_error', err);
      toast({ who: 'CloudCut', body: 'Real-time sync failed — see console' });
    });

    channel.bind('pusher:subscription_succeeded', (members: {
      each: (cb: (m: PresenceMember) => void) => void;
    }) => {
      const list: Collaborator[] = [];
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

    return () => {
      pusher.unsubscribe(channelName);
      setCollaborators([]);
    };
  }, [projectId, setCollaborators, addCollaborator, removeCollaborator, toast]);

  return { count: collaborators.length };
}
