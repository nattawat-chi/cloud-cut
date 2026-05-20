import { useState } from 'react';
import { Trash2Icon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ApiError, assets as assetsApi, timeline as timelineApi } from '@/services/api';
import { useAssetsStore } from '@/state/assetsStore';
import { useHistoryStore } from '@/state/historyStore';
import { useProjectStore } from '@/state/projectStore';
import type { Asset } from '@/types';
import { fmtClipDur } from '@/utils/timecode';

import { AssetStatusPill } from './AssetStatusPill';
import { AssetThumb } from './AssetThumb';

interface AssetRowProps {
  asset: Asset;
}

/**
 * Single draggable asset card. Drag-to-timeline payload is consumed by
 * `Timeline.tsx` (Phase 1.6). The trash icon appears on hover and calls
 * `DELETE /assets/:id`; the backend rejects with 409 when the asset is still
 * referenced by any clip, which we surface as a toast.
 */
export function AssetRow({ asset }: AssetRowProps) {
  const removeFromStore = useAssetsStore((s) => s.remove);
  const toast = useHistoryStore((s) => s.toast);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (deleting) return;

    // Backend rejects DELETE /assets/:id with 409 while any clip references
    // the asset (see backend/src/assets/handlers.rs::delete_asset). We mirror
    // that check locally, ask the user for explicit consent, then cascade-
    // delete the clips before retrying the asset delete — the user previously
    // saw an opaque "409 Conflict" with no path forward.
    const linkedClipIds = useProjectStore
      .getState()
      .clips.filter((c) => c.assetId === asset.id)
      .map((c) => c.id);

    if (linkedClipIds.length > 0) {
      const n = linkedClipIds.length;
      const ok = window.confirm(
        `"${asset.name}" is used by ${n} clip${n > 1 ? 's' : ''} on the timeline.\n\n` +
          `Remove ${n > 1 ? 'them' : 'it'} and delete the asset?`,
      );
      if (!ok) return;
    }

    setDeleting(true);
    try {
      if (linkedClipIds.length > 0) {
        // Backend deletes must finish before we hit DELETE /assets/:id —
        // otherwise the in-use check still sees the rows and returns 409.
        // Skip temp-id clips (`c-tmp*`) — they have no server-side row yet.
        const realIds = linkedClipIds.filter((id) => !id.startsWith('c-tmp'));
        await Promise.all(
          realIds.map((id) => timelineApi.deleteClip(id).catch(() => null)),
        );
        // Local mirror — removes clips, cleans up effects, deselects.
        // The action also fires its own (now redundant) DELETEs; those just
        // 404 silently which is fine.
        useProjectStore.getState().deleteClips(linkedClipIds);
      }

      await assetsApi.delete(asset.id);
      removeFromStore(asset.id);
      toast({ who: 'Assets', body: `Deleted ${asset.name}` });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message;
      toast({ who: 'Delete failed', body: msg });
      setDeleting(false);
    }
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-cloudcut-asset', asset.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      className={cn(
        'group relative mb-0.5 grid cursor-grab grid-cols-[56px_1fr_auto] items-center gap-2.5',
        'rounded-md border border-transparent p-1.5',
        'hover:border-line-soft hover:bg-surface-2',
        'active:cursor-grabbing',
        deleting && 'opacity-40',
      )}
    >
      <AssetThumb asset={asset} />

      <div className="min-w-0">
        <div className="font-mono truncate text-xs font-medium text-text-1">
          {asset.name}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-text-3">
          <span>{asset.size}</span>
          {asset.durMs != null && (
            <>
              <span className="text-text-4">·</span>
              <span className="font-mono">{fmtClipDur(asset.durMs)}</span>
            </>
          )}
        </div>
        {asset.status !== 'ready' && (
          <div className="mt-1 h-0.5 overflow-hidden rounded-[1px] bg-surface-3">
            <div
              className="h-full bg-accent transition-[width] duration-300 ease-linear"
              style={{ width: `${asset.progress}%` }}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <AssetStatusPill asset={asset} />
        <button
          type="button"
          title="Delete asset"
          onClick={handleDelete}
          disabled={deleting}
          className={cn(
            'grid h-6 w-6 place-items-center rounded text-text-4 opacity-0 transition-opacity',
            'group-hover:opacity-100',
            'hover:bg-danger/15 hover:text-danger',
            'disabled:cursor-default',
          )}
        >
          <Trash2Icon size={12} />
        </button>
      </div>
    </div>
  );
}
