import { useEffect } from 'react';
import { XIcon } from 'lucide-react';

import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import type { EffectType } from '@/types';

interface FxEntry {
  readonly id: string;
  readonly cat: string;
  readonly name: string;
  /** CSS background for the preview thumbnail. */
  readonly preview: string;
  /** Optional CSS filter applied to the preview to demonstrate the effect. */
  readonly filter?: string;
  /** When provided, clicking the card adds this effect type to the selected clip. */
  readonly wireTo?: EffectType;
}

/**
 * 12 effects organized in 4 columns × 3 rows. Only the 4 entries with
 * `wireTo` actually mutate state — the rest are visual demos kept for the
 * Phase 1 UI fidelity. Phase 4 backend will expand the catalogue.
 */
const FX_LIBRARY: readonly FxEntry[] = [
  { id: 'brightness', cat: 'Color',     name: 'Brightness',    preview: 'linear-gradient(120deg, oklch(0.78 0.08 60), oklch(0.85 0.10 80))', filter: 'brightness(1.2)', wireTo: 'brightness' },
  { id: 'contrast',   cat: 'Color',     name: 'Contrast',      preview: 'linear-gradient(120deg, oklch(0.95 0.02 260), oklch(0.18 0.01 260))', filter: 'contrast(1.4)', wireTo: 'contrast' },
  { id: 'saturation', cat: 'Color',     name: 'Saturation',    preview: 'linear-gradient(120deg, oklch(0.7 0.20 30), oklch(0.7 0.20 290))', filter: 'saturate(1.6)', wireTo: 'saturation' },
  { id: 'hue',        cat: 'Color',     name: 'Hue shift',     preview: 'conic-gradient(from 0deg, oklch(0.7 0.18 0), oklch(0.7 0.18 120), oklch(0.7 0.18 240), oklch(0.7 0.18 360))' },
  { id: 'blur',       cat: 'Stylize',   name: 'Gaussian blur', preview: 'linear-gradient(120deg, oklch(0.6 0.10 230), oklch(0.4 0.08 280))', filter: 'blur(4px)', wireTo: 'blur' },
  { id: 'sharpen',    cat: 'Stylize',   name: 'Sharpen',       preview: 'repeating-linear-gradient(45deg, oklch(0.4 0.04 260) 0 4px, oklch(0.6 0.06 260) 4px 8px)' },
  { id: 'grain',      cat: 'Stylize',   name: 'Film grain',    preview: 'radial-gradient(circle at 30% 40%, oklch(0.7 0.05 60), oklch(0.4 0.04 60))' },
  { id: 'vignette',   cat: 'Stylize',   name: 'Vignette',      preview: 'radial-gradient(circle, oklch(0.65 0.10 30) 0%, oklch(0.18 0.02 30) 90%)' },
  { id: 'chroma-key', cat: 'Composite', name: 'Chroma key',    preview: 'linear-gradient(120deg, oklch(0.78 0.20 145), oklch(0.5 0.10 145))' },
  { id: 'luma-key',   cat: 'Composite', name: 'Luma key',      preview: 'linear-gradient(120deg, oklch(0.95 0 0), oklch(0.18 0 0))' },
  { id: 'speed',      cat: 'Time',      name: 'Speed ramp',    preview: 'linear-gradient(60deg, oklch(0.5 0.13 220), oklch(0.7 0.15 280))' },
  { id: 'reverse',    cat: 'Time',      name: 'Reverse',       preview: 'linear-gradient(240deg, oklch(0.6 0.13 30), oklch(0.45 0.10 60))' },
];

export function EffectsBrowser() {
  const open = useUIStore((s) => s.showEffectsBrowser);
  const toggle = useUIStore((s) => s.toggleEffectsBrowser);
  const selectedIds = useUIStore((s) => s.selectedClipIds);
  const addEffect = useProjectStore((s) => s.addEffect);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, toggle]);

  if (!open) return null;

  const apply = (fx: FxEntry) => {
    const target = selectedIds[0];
    if (target && fx.wireTo) addEffect(target, fx.wireTo);
    toggle();
  };

  return (
    <div
      role="dialog"
      aria-label="Effects browser"
      onClick={toggle}
      className="fixed inset-0 z-[100] grid place-items-center"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-line bg-surface-1 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-semibold tracking-tight">Effects browser</h2>
          <button
            type="button"
            onClick={toggle}
            className="grid h-7 w-7 place-items-center rounded-md text-text-2 hover:bg-surface-3 hover:text-text-1"
          >
            <XIcon size={14} />
          </button>
        </div>
        <div className="overflow-y-auto p-5">
          <div className="grid w-[720px] grid-cols-4 gap-2.5">
            {FX_LIBRARY.map((fx) => (
              <button
                key={fx.id}
                type="button"
                onClick={() => apply(fx)}
                className="cursor-pointer overflow-hidden rounded-md border border-line bg-surface-2 text-left transition-colors hover:border-accent"
                title={fx.wireTo ? 'Add to selected clip' : 'Preview only'}
              >
                <div
                  className="relative overflow-hidden"
                  style={{ aspectRatio: '16 / 10', background: fx.preview, filter: fx.filter }}
                />
                <div className="flex items-center justify-between px-2.5 py-2">
                  <span className="text-xs font-medium text-text-1">{fx.name}</span>
                  <span className="text-[9px] uppercase tracking-[0.06em] text-text-4">
                    {fx.cat}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
