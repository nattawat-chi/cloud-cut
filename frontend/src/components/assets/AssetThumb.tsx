import { ImageIcon, MusicIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Asset } from '@/types';
import { fmtClipDur } from '@/utils/timecode';

interface AssetThumbProps {
  asset: Asset;
}

/**
 * 56×36 asset thumbnail. Audio renders a vertical gradient + music glyph;
 * image/video render the asset's gradient (CSS stand-in for a real frame).
 * A small duration chip sits on the bottom-right when applicable.
 */
export function AssetThumb({ asset }: AssetThumbProps) {
  if (asset.type === 'audio') {
    return (
      <div
        className={cn(
          'relative grid h-9 w-14 place-items-center overflow-hidden rounded-sm border border-line-soft text-white',
        )}
        style={{
          background:
            'linear-gradient(180deg, var(--clip-a-1) 0%, color-mix(in oklch, var(--clip-a-1) 50%, var(--bg-2)) 100%)',
        }}
      >
        <MusicIcon size={16} />
        {asset.durMs != null && <DurationChip durMs={asset.durMs} />}
      </div>
    );
  }

  if (asset.type === 'image') {
    return (
      <div
        className="relative grid h-9 w-14 place-items-center overflow-hidden rounded-sm border border-line-soft text-text-4"
        style={asset.thumb ? { background: asset.thumb } : undefined}
      >
        <ImageIcon size={14} />
      </div>
    );
  }

  // video
  return (
    <div
      className="relative h-9 w-14 overflow-hidden rounded-sm border border-line-soft bg-surface-3"
      style={asset.thumb ? { background: asset.thumb } : undefined}
    >
      {asset.durMs != null && <DurationChip durMs={asset.durMs} />}
    </div>
  );
}

function DurationChip({ durMs }: { durMs: number }) {
  return (
    <span
      className={cn(
        'font-mono absolute bottom-0.5 right-0.5 rounded-[2px] px-[3px] py-[1px]',
        'text-[9px] text-white',
      )}
      style={{ background: 'rgba(0, 0, 0, 0.6)' }}
    >
      {fmtClipDur(durMs)}
    </span>
  );
}
