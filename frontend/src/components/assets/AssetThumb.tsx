import { useState } from 'react';
import { FilmIcon, ImageIcon, MusicIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Asset } from '@/types';
import { fmtClipDur } from '@/utils/timecode';

interface AssetThumbProps {
  asset: Asset;
}

/**
 * 56×36 asset thumbnail.
 * - Audio: waveform gradient + music glyph.
 * - Video/image: real <img> when thumb is a URL (from the worker's thumbnail.jpg),
 *   CSS gradient fallback for mock data or while the worker is processing.
 */
export function AssetThumb({ asset }: AssetThumbProps) {
  if (asset.type === 'audio') {
    return (
      <div
        className="relative grid h-9 w-14 place-items-center overflow-hidden rounded-sm border border-line-soft text-white"
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
      <div className="relative grid h-9 w-14 place-items-center overflow-hidden rounded-sm border border-line-soft text-text-4 bg-surface-3">
        <ThumbContent thumb={asset.thumb} />
        <ImageIcon size={14} className="relative z-10 text-text-4 mix-blend-overlay" />
      </div>
    );
  }

  // video
  return (
    <div className="relative h-9 w-14 overflow-hidden rounded-sm border border-line-soft bg-surface-3">
      <ThumbContent thumb={asset.thumb} />
      {asset.durMs != null && <DurationChip durMs={asset.durMs} />}
    </div>
  );
}

/**
 * Renders the thumbnail content inside the container.
 * - Real URL (http/https): <img> with object-cover + fallback icon on error.
 * - CSS gradient string (mock / seeded data): inline background style.
 * - undefined: empty (shows the bg-surface-3 base).
 */
function ThumbContent({ thumb }: { thumb?: string }) {
  const [imgError, setImgError] = useState(false);

  if (!thumb) return null;

  const isUrl = thumb.startsWith('http://') || thumb.startsWith('https://') || thumb.startsWith('/');

  if (isUrl && !imgError) {
    return (
      <>
        <img
          src={thumb}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
        {/* subtle dark vignette so the duration chip stays readable */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 55%)' }}
        />
      </>
    );
  }

  if (isUrl && imgError) {
    // thumbnail.jpg not yet in MinIO (worker still processing) — show icon placeholder
    return (
      <div className="absolute inset-0 grid place-items-center text-text-4">
        <FilmIcon size={14} />
      </div>
    );
  }

  // CSS gradient (mock data)
  return <div className="absolute inset-0" style={{ background: thumb }} />;
}

function DurationChip({ durMs }: { durMs: number }) {
  return (
    <span
      className={cn(
        'font-mono absolute bottom-0.5 right-0.5 z-10 rounded-[2px] px-[3px] py-[1px]',
        'text-[9px] text-white',
      )}
      style={{ background: 'rgba(0, 0, 0, 0.6)' }}
    >
      {fmtClipDur(durMs)}
    </span>
  );
}
