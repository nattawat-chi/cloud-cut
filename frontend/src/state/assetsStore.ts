import { create } from 'zustand';

import { assets as assetsApi, type AssetResponse } from '@/services/api';
import type { Asset, AssetStatus, AssetType, UUID } from '@/types';

/* =============================================================================
   assetsStore — workspace-scoped list of uploadable media.

   Source of truth is the backend; this store caches it for the AssetBrowser
   plus drives a lightweight polling loop while any asset is still processing
   (the worker flips `status` from "processing" → "ready" once ffmpeg jobs
   complete and variants land in S3).

   Pusher events would supersede polling in production, but a 3-second poll
   keeps the demo simple and proves the round-trip works end-to-end.
   ============================================================================= */

export interface AssetsState {
  items: readonly Asset[];
  byId: Readonly<Record<UUID, Asset>>;
  hydrated: boolean;
  loading: boolean;
  error: string | null;

  /** Fetch from API and replace the cache. Safe to call repeatedly. */
  hydrate: (workspaceId: UUID) => Promise<void>;

  /** Insert/replace one asset (used right after a successful upload). */
  upsert: (asset: Asset) => void;

  /** Patch an existing asset (used by the poller when status changes). */
  update: (id: UUID, patch: Partial<Asset>) => void;

  /** Clear cache — call on logout / workspace switch. */
  reset: () => void;
}

const initialState = {
  items: [] as readonly Asset[],
  byId: {} as Readonly<Record<UUID, Asset>>,
  hydrated: false,
  loading: false,
  error: null as string | null,
};

export const useAssetsStore = create<AssetsState>()((set) => ({
  ...initialState,

  hydrate: async (workspaceId) => {
    set({ loading: true, error: null });
    try {
      const { items } = await assetsApi.list(workspaceId);
      const mapped = items.map(toAsset);
      const byId: Record<UUID, Asset> = {};
      for (const a of mapped) byId[a.id] = a;
      set({ items: mapped, byId, hydrated: true, loading: false });
    } catch (e) {
      set({ loading: false, error: (e as Error).message });
    }
  },

  upsert: (asset) =>
    set((s) => {
      const idx = s.items.findIndex((a) => a.id === asset.id);
      const items =
        idx === -1
          ? [asset, ...s.items]
          : s.items.map((a) => (a.id === asset.id ? asset : a));
      return { items, byId: { ...s.byId, [asset.id]: asset } };
    }),

  update: (id, patch) =>
    set((s) => {
      const existing = s.byId[id];
      if (!existing) return {};
      const next: Asset = { ...existing, ...patch };
      return {
        items: s.items.map((a) => (a.id === id ? next : a)),
        byId: { ...s.byId, [id]: next },
      };
    }),

  reset: () => set({ ...initialState }),
}));

// ─── Selectors ───────────────────────────────────────────────────────────────

export function selectHasProcessing(s: AssetsState): boolean {
  return s.items.some((a) => a.status === 'uploading' || a.status === 'processing');
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

/** Map an `AssetResponse` from the backend into the frontend's `Asset` shape. */
export function toAsset(r: AssetResponse): Asset {
  const type: AssetType = r.kind === 'font' ? 'image' : (r.kind as AssetType);
  const base = `${import.meta.env.VITE_S3_PUBLIC_URL ?? '/s3/cloudcut-assets'}/variants/${r.id}`;
  const ready = r.status === 'ready';

  // Real progress comes from the backend `progress_pct` column the worker
  // updates from ffmpeg's `-progress` output. Fall back to 0 if absent
  // (older backend builds / asset uploaded before worker was running).
  const backendProgress = (r as AssetResponse & { progress_pct?: number }).progress_pct;
  const progress =
    typeof backendProgress === 'number'
      ? backendProgress
      : ready
        ? 100
        : 0;

  return {
    id: r.id,
    type,
    name: r.name,
    durMs: r.duration_ms,
    size: formatBytes(r.size_bytes),
    status: r.status as AssetStatus,
    progress,
    thumb: ready ? `${base}/thumbnail.jpg` : undefined,
    // Worker generates proxy.mp4 only for video assets — see
    // worker/src/jobs/process_asset.rs::process_video.
    proxyUrl: ready && type === 'video' ? `${base}/proxy.mp4` : undefined,
  };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${Math.round(n / (1024 * 1024))} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
