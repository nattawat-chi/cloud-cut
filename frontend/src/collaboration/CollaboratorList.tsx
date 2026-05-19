/**
 * CollaboratorList — null-render component that wires up the full
 * real-time collaboration stack for the active project.
 *
 * Responsibilities (delegated to focused hooks):
 *   1. usePusher       — maintain Pusher singleton + log connection state
 *   2. usePresence     — subscribe presence channel, sync member list
 *   3. useOperationSync — bind clip:* events, apply remote ops to projectStore
 *
 * Mount once at app root (inside <App />) so the channel stays alive for
 * the entire editor session. Harmlessly no-ops when Pusher is not configured.
 */

import { useEffect } from 'react';

import { isPusherEnabled } from '@/services/pusher';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';

import { useOperationSync } from './useOperationSync';
import { usePresence } from './usePresence';
import { usePusher } from './usePusher';

export function CollaboratorList(): null {
  const projectId   = useProjectStore((s) => s.project?.id ?? null);
  const showPresence = useUIStore((s) => s.showPresence);

  const { connectionState } = usePusher();

  // Only subscribe when the editor has presence enabled
  const activeProjectId = showPresence ? projectId : null;

  usePresence(activeProjectId);
  useOperationSync(activeProjectId);

  // Log connection state changes in development
  useEffect(() => {
    if (!isPusherEnabled()) {
      console.info(
        '[CollaboratorList] Pusher disabled — VITE_PUSHER_KEY missing.\n' +
        'Add it to .env and restart `pnpm dev` to enable real-time collaboration.',
      );
      return;
    }
    console.info(`[CollaboratorList] connection: ${connectionState}`);
  }, [connectionState]);

  return null;
}
