import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface PanelPlaceholderProps {
  icon: ReactNode;
  phase: string;
  description: string;
  className?: string;
}

/**
 * Empty-state filler used by panels that aren't ported yet.
 * Each panel keeps its real shell (head + body container) so the layout grid
 * doesn't shift when we replace placeholders with the real component.
 */
export function PanelPlaceholder({
  icon,
  phase,
  description,
  className,
}: PanelPlaceholderProps) {
  return (
    <div
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center',
        className,
      )}
    >
      <div
        className={cn(
          'grid h-10 w-10 place-items-center rounded-lg border border-line',
          'bg-surface-2 text-text-3',
        )}
      >
        {icon}
      </div>
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-4">
          {phase}
        </div>
        <div className="mt-1 text-xs text-text-3">{description}</div>
      </div>
    </div>
  );
}
