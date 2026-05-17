import { useEffect } from 'react';
import { XIcon } from 'lucide-react';

import { useUIStore } from '@/state/uiStore';

interface ShortcutSection {
  readonly sec: string;
  readonly rows: ReadonlyArray<{ keys: readonly string[]; desc: string }>;
}

const SHORTCUTS: readonly ShortcutSection[] = [
  {
    sec: 'Playback',
    rows: [
      { keys: ['Space'], desc: 'Play / Pause' },
      { keys: ['J'], desc: 'Reverse' },
      { keys: ['K'], desc: 'Pause' },
      { keys: ['L'], desc: 'Forward' },
      { keys: ['←', '→'], desc: 'Step 1 frame' },
      { keys: ['⇧', '←'], desc: 'Step 1 second' },
      { keys: ['Home'], desc: 'Go to start' },
      { keys: ['End'], desc: 'Go to end' },
    ],
  },
  {
    sec: 'Editing',
    rows: [
      { keys: ['V'], desc: 'Select tool' },
      { keys: ['B'], desc: 'Blade tool' },
      { keys: ['H'], desc: 'Hand tool' },
      { keys: ['S'], desc: 'Split at playhead' },
      { keys: ['I'], desc: 'Mark In' },
      { keys: ['O'], desc: 'Mark Out' },
      { keys: ['Del'], desc: 'Delete selected' },
      { keys: ['⌘', 'D'], desc: 'Duplicate' },
    ],
  },
  {
    sec: 'Timeline',
    rows: [
      { keys: ['⌘', '+'], desc: 'Zoom in' },
      { keys: ['⌘', '-'], desc: 'Zoom out' },
      { keys: ['⌘', '0'], desc: 'Zoom to fit' },
      { keys: ['N'], desc: 'Toggle snap' },
      { keys: ['Alt'], desc: 'Disable snap (hold)' },
      { keys: ['⌘', 'Z'], desc: 'Undo' },
      { keys: ['⇧', '⌘', 'Z'], desc: 'Redo' },
      { keys: ['?'], desc: 'This panel' },
    ],
  },
];

export function ShortcutsOverlay() {
  const open = useUIStore((s) => s.showShortcuts);
  const toggle = useUIStore((s) => s.toggleShortcuts);

  // Escape closes — registered only while open so we don't leak listeners.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, toggle]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      onClick={toggle}
      className="fixed inset-0 z-[100] grid place-items-center"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-line bg-surface-1 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-semibold tracking-tight">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={toggle}
            className="grid h-7 w-7 place-items-center rounded-md text-text-2 hover:bg-surface-3 hover:text-text-1"
          >
            <XIcon size={14} />
          </button>
        </div>
        <div className="overflow-y-auto p-5">
          <div className="grid min-w-[720px] grid-cols-3 gap-x-9 gap-y-5">
            {SHORTCUTS.map((sec) => (
              <section key={sec.sec}>
                <h3 className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-3">
                  {sec.sec}
                </h3>
                {sec.rows.map((row) => (
                  <div
                    key={row.desc}
                    className="flex items-center justify-between py-1 text-xs"
                  >
                    <span className="text-text-2">{row.desc}</span>
                    <span className="flex gap-0.5">
                      {row.keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="font-mono min-w-4 rounded border border-line bg-surface-3 px-1.5 py-px text-center text-[10px] text-text-1"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
