import { cn } from '@/lib/utils';
import type { Asset } from '@/types';
import { fmtClipDur } from '@/utils/timecode';

import { AssetStatusPill } from './AssetStatusPill';
import { AssetThumb } from './AssetThumb';

interface AssetRowProps {
  asset: Asset;
}

/**
 * Single draggable asset card. Drag-to-timeline wiring lands in Phase 1.6
 * (Timeline implements the drop target). For now the `draggable` attribute
 * + dataTransfer payload is set so the browser shows a drag affordance.
 */
export function AssetRow({ asset }: AssetRowProps) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        // Phase 1.6 wires the timeline drop target to read this payload.
        e.dataTransfer.setData('application/x-cloudcut-asset', asset.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      className={cn(
        'mb-0.5 grid cursor-grab grid-cols-[56px_1fr_auto] items-center gap-2.5',
        'rounded-md border border-transparent p-1.5',
        'hover:border-line-soft hover:bg-surface-2',
        'active:cursor-grabbing',
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

      <AssetStatusPill asset={asset} />
    </div>
  );
}
