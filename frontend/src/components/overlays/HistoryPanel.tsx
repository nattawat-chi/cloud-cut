import { FilmIcon, RedoIcon, SparklesIcon, UndoIcon, XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  selectCanRedo,
  selectCanUndo,
  useHistoryStore,
} from '@/state/historyStore';
import { useUIStore } from '@/state/uiStore';
import type { HistoryEntry } from '@/types';

/**
 * Floating history panel anchored top-right of the viewport.
 * Click an entry to time-travel; undone entries fade.
 */
export function HistoryPanel() {
  const open = useUIStore((s) => s.showHistoryPanel);
  const toggle = useUIStore((s) => s.toggleHistoryPanel);
  const entries = useHistoryStore((s) => s.entries);
  const cursor = useHistoryStore((s) => s.cursor);
  const canUndo = useHistoryStore(selectCanUndo);
  const canRedo = useHistoryStore(selectCanRedo);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);
  const jumpTo = useHistoryStore((s) => s.jumpTo);

  if (!open) return null;

  // Reverse copy so newest entries sit at the top, but jumpTo gets the
  // real (forward) index.
  const reversed: ReadonlyArray<{ entry: HistoryEntry; realIdx: number }> = entries
    .map((entry, realIdx) => ({ entry, realIdx }))
    .slice()
    .reverse();

  return (
    <div
      className={cn(
        'fixed right-3.5 top-14 z-[50] flex max-h-[380px] w-[280px] flex-col overflow-hidden',
        'rounded-lg border border-line bg-surface-1 shadow-xl',
      )}
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <span className="text-xs font-medium">History</span>
        <div className="flex gap-0.5">
          <IconBtn title="Undo" onClick={undo} disabled={!canUndo}>
            <UndoIcon size={11} />
          </IconBtn>
          <IconBtn title="Redo" onClick={redo} disabled={!canRedo}>
            <RedoIcon size={11} />
          </IconBtn>
          <IconBtn title="Close" onClick={toggle}>
            <XIcon size={11} />
          </IconBtn>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-1">
        {reversed.map(({ entry, realIdx }) => {
          const isCurrent = realIdx === cursor;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => jumpTo(realIdx)}
              title={`${entry.who} · ${entry.ts}`}
              className={cn(
                'flex w-full items-center justify-between rounded-sm border-l-2 px-2 py-1.5 text-[11px]',
                isCurrent
                  ? 'border-accent bg-accent-soft text-text-1'
                  : 'border-transparent text-text-2 hover:bg-surface-2',
                entry.undone && !isCurrent && 'text-text-4',
              )}
            >
              <span className="flex items-center gap-1.5 overflow-hidden">
                <span className="text-text-4">
                  {entry.type.startsWith('clip') && <FilmIcon size={10} />}
                  {entry.type.startsWith('effect') && <SparklesIcon size={10} />}
                </span>
                <span className="truncate">{entry.desc}</span>
              </span>
              <span className="font-mono shrink-0 pl-1.5 text-[9.5px] text-text-4">
                {entry.ts}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'grid h-5 w-5 place-items-center rounded text-text-2 hover:bg-surface-3 hover:text-text-1',
        'disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent',
      )}
    >
      {children}
    </button>
  );
}
