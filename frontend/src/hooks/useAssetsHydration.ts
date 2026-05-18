import { useEffect } from 'react';

import { selectHasProcessing, useAssetsStore } from '@/state/assetsStore';

const POLL_INTERVAL_MS = 3_000;

/**
 * Hydrate the assets store for a workspace and poll while anything is still
 * processing. Stops automatically once every asset is `ready` (or `error`).
 *
 * Returns the store's current loading/error so the caller can render a
 * spinner or banner without re-subscribing.
 */
export function useAssetsHydration(workspaceId: string | null | undefined): {
  loading: boolean;
  error: string | null;
} {
  const loading = useAssetsStore((s) => s.loading);
  const error = useAssetsStore((s) => s.error);
  const hydrate = useAssetsStore((s) => s.hydrate);
  const hasProcessing = useAssetsStore(selectHasProcessing);

  // Initial hydrate
  useEffect(() => {
    if (!workspaceId) return;
    void hydrate(workspaceId);
  }, [workspaceId, hydrate]);

  // Poll while anything is still processing
  useEffect(() => {
    if (!workspaceId || !hasProcessing) return;
    const id = window.setInterval(() => {
      void hydrate(workspaceId);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [workspaceId, hasProcessing, hydrate]);

  return { loading, error };
}
