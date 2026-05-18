/* =============================================================================
   useOperationSync — offline reconnect flow (§4.5).

   On every reconnect the client must:
     1. remember the last `server_seq` it has applied locally
     2. GET /api/v1/projects/:id/operations?afterSeq=X
     3. apply the missed operations in order
     4. reload the full project state if the gap is too large

   This hook owns steps 2 + 4.  Apply (step 3) is delegated to the caller via
   the `onOperation` callback so the projectStore stays the single source of
   truth for state mutations.
   ============================================================================= */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { UUID } from '@/types';

const RELOAD_THRESHOLD = 500;     // matches the backend's per-page LIMIT
const POLL_ON_RECONNECT_MS = 0;   // fire once immediately after connection regained

export interface OperationEntry {
  seq:        number;
  userId:     UUID;
  type:       string;
  payload:    unknown;
  appliedAt:  string;
}

export interface OperationsResponse {
  operations: OperationEntry[];
  nextSeq:    number;
}

export interface UseOperationSyncArgs {
  projectId: UUID | null;
  /** Bearer JWT — `null` means we're logged out so don't sync. */
  authToken: string | null;
  /** Phase 5 flips this true after the Pusher connection drops + recovers. */
  reconnectNonce?: number;
  /** Invoked once per missed operation, in seq-ascending order. */
  onOperation: (op: OperationEntry) => void;
  /** Invoked when the gap exceeds RELOAD_THRESHOLD so the caller can reload state. */
  onReloadRequired?: () => void;
}

export interface UseOperationSyncResult {
  /** Highest seq applied locally — persist this across reconnects. */
  lastSeq: number;
  /** True while a fetch is in flight. */
  syncing: boolean;
  /** Manually kick a sync (e.g. tab-focus event). */
  syncNow: () => Promise<void>;
}

export function useOperationSync(args: UseOperationSyncArgs): UseOperationSyncResult {
  const { projectId, authToken, reconnectNonce, onOperation, onReloadRequired } = args;
  const lastSeqRef = useRef(0);
  const [lastSeq, setLastSeq] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const syncNow = useCallback(async () => {
    if (!projectId || !authToken) return;
    setSyncing(true);
    try {
      const url = `/api/v1/projects/${projectId}/operations?afterSeq=${lastSeqRef.current}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) {
        // 401 → logged out; 404 → project gone.  Caller decides UX.
        return;
      }
      const body = (await res.json()) as OperationsResponse;
      for (const op of body.operations) {
        onOperation(op);
      }
      if (body.operations.length >= RELOAD_THRESHOLD) {
        onReloadRequired?.();
      }
      lastSeqRef.current = body.nextSeq;
      setLastSeq(body.nextSeq);
    } finally {
      setSyncing(false);
    }
  }, [projectId, authToken, onOperation, onReloadRequired]);

  useEffect(() => {
    if (reconnectNonce === undefined) return;
    const t = window.setTimeout(() => { void syncNow(); }, POLL_ON_RECONNECT_MS);
    return () => window.clearTimeout(t);
  }, [reconnectNonce, syncNow]);

  return { lastSeq, syncing, syncNow };
}
