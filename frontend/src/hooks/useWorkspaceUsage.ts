/**
 * useWorkspaceUsage — polls `GET /workspaces/:id/usage` so the topbar +
 * Export dialog can render the live `X/Y` counter pair instead of just the
 * plan limit.
 *
 * Poll interval is 10s by default — enough to feel live without hammering
 * the backend. Hidden tabs pause the poll via the Page Visibility API so
 * an idle editor doesn't keep firing requests.
 */

import { useEffect, useState } from 'react';

import { workspaces, type WorkspaceUsageResponse } from '@/services/api';

const POLL_INTERVAL_MS = 10_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface UseWorkspaceUsageResult {
  usage: WorkspaceUsageResponse | null;
  /** True until the first successful fetch. */
  loading: boolean;
}

export function useWorkspaceUsage(
  workspaceId: string | null | undefined,
): UseWorkspaceUsageResult {
  const [usage, setUsage] = useState<WorkspaceUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId || !UUID_RE.test(workspaceId)) {
      // Mock / offline mode — leave usage null so consumers fall back to
      // displaying just the limit.
      setUsage(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchOnce = async () => {
      try {
        const u = await workspaces.getUsage(workspaceId);
        if (!cancelled) {
          setUsage(u);
          setLoading(false);
        }
      } catch {
        // Network blip — keep showing the previous snapshot rather than
        // flashing "—". Drop loading so the UI stops showing a spinner.
        if (!cancelled) setLoading(false);
      }
    };

    void fetchOnce();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void fetchOnce();
    }, POLL_INTERVAL_MS);

    // Refresh immediately when the user comes back to the tab — keeps the
    // counter feeling instant after a long idle.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchOnce();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [workspaceId]);

  return { usage, loading };
}
