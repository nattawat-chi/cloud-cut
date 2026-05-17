import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface PanelHeadProps {
  title: string;
  tools?: ReactNode;
  className?: string;
}

/**
 * Shared 36px panel header — the small uppercase strip every panel in the
 * editor uses to identify itself. Matches the prototype's `.panel-head` rule.
 */
export function PanelHead({ title, tools, className }: PanelHeadProps) {
  return (
    <div
      className={cn(
        'flex h-9 shrink-0 items-center justify-between border-b border-line bg-surface-1 px-3',
        'text-[11px] font-medium uppercase tracking-[0.07em] text-text-3',
        className,
      )}
    >
      <span className="font-semibold text-text-2">{title}</span>
      {tools && <div className="flex gap-0.5">{tools}</div>}
    </div>
  );
}
