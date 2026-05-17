import { CheckIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Asset } from '@/types';

interface AssetStatusPillProps {
  asset: Asset;
}

/**
 * Status badge rendered on the right of each asset row.
 *   ready      — green check
 *   processing — yellow spinner + %
 *   uploading  — accent spinner + %
 *   failed     — danger label (Phase 3 — won't appear in mocks)
 */
export function AssetStatusPill({ asset }: AssetStatusPillProps) {
  switch (asset.status) {
    case 'ready':
      return (
        <Pill className="bg-status-ok/15 text-status-ok">
          <CheckIcon size={9} />
          ready
        </Pill>
      );
    case 'processing':
      return (
        <Pill className="bg-status-warn/15 text-status-warn">
          <Spinner />
          processing {asset.progress}%
        </Pill>
      );
    case 'uploading':
      return (
        <Pill className="bg-accent-soft text-accent">
          <Spinner />
          uploading {asset.progress}%
        </Pill>
      );
    case 'failed':
      return <Pill className="bg-status-danger/15 text-status-danger">failed</Pill>;
  }
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        className,
      )}
    >
      {children}
    </span>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full border-[1.5px] border-current border-t-transparent"
      style={{ animation: 'var(--animate-cc-spinner)' }}
    />
  );
}
