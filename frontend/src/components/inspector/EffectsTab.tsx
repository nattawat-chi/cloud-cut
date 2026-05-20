import { PlusIcon, SparklesIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  selectEffectsForClip,
  useProjectStore,
} from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import { EFFECT_META } from '@/types';
import type { Clip, ClipEffect, EffectType } from '@/types';

import { EffectEditor } from './EffectEditor';

interface EffectsTabProps {
  clip: Clip;
  readOnly?: boolean;
}

const EFFECT_TYPES: ReadonlyArray<EffectType> = [
  'brightness',
  'contrast',
  'saturation',
  'blur',
];

/**
 * Effects tab — list of active effects + add menu + live CSS-filter readout.
 * Each effect is bound to projectStore so dragging a slider repaints the
 * player preview through `filterFromEffects()`.
 */
export function EffectsTab({ clip, readOnly = false }: EffectsTabProps) {
  const effects = useProjectStore(selectEffectsForClip(clip.id));
  const addEffect = useProjectStore((s) => s.addEffect);
  const toggleEffectsBrowser = useUIStore((s) => s.toggleEffectsBrowser);

  const hasType = (t: EffectType) => effects.some((fx) => fx.type === t);

  return (
    <div className="flex-1 overflow-y-auto px-3.5 pb-10 pt-3">
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-3">
            Effects · {effects.length}
          </span>
          {!readOnly && (
            <button
              type="button"
              onClick={toggleEffectsBrowser}
              className="rounded px-1.5 text-[10px] text-text-3 hover:bg-surface-3 hover:text-text-1"
              style={{ height: 20 }}
            >
              Browse
            </button>
          )}
        </div>

        {effects.map((fx) => (
          <EffectEditor key={fx.id} clipId={clip.id} fx={fx} readOnly={readOnly} />
        ))}

        {!readOnly && (
          <details className="group mt-2">
            <summary className="list-none">
              <span
                className={cn(
                  'flex h-[30px] cursor-pointer items-center justify-center gap-1.5',
                  'rounded-md border border-dashed border-line bg-surface-2',
                  'text-[11px] text-text-3 hover:border-accent hover:text-accent',
                )}
              >
                <PlusIcon size={12} /> Add Effect
              </span>
            </summary>
            <div className="mt-1.5 grid gap-1">
              {EFFECT_TYPES.map((type) => {
                const already = hasType(type);
                return (
                  <button
                    key={type}
                    type="button"
                    disabled={already}
                    onClick={() => addEffect(clip.id, type)}
                    className={cn(
                      'flex h-[26px] w-full items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2',
                      'text-[11px] text-text-2',
                      already
                        ? 'cursor-default opacity-50'
                        : 'hover:bg-surface-3 hover:text-text-1',
                    )}
                  >
                    <SparklesIcon size={11} />
                    <span>{EFFECT_META[type].label}</span>
                    {already && (
                      <span className="ml-auto text-[10px] text-text-4">added</span>
                    )}
                  </button>
                );
              })}
            </div>
          </details>
        )}
      </div>

      <CssReadout effects={effects} />
    </div>
  );
}

function CssReadout({ effects }: { effects: readonly ClipEffect[] }) {
  const enabled = effects.filter((fx) => fx.enabled);
  return (
    <div className="mb-4">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-3">
        CSS Preview
      </div>
      <div
        className="font-mono rounded-md border border-line bg-surface-2 p-2.5 text-[10.5px] leading-[1.55] text-text-2"
      >
        <div className="text-text-4">filter:</div>
        {enabled.length === 0 ? (
          <div className="pl-3.5 text-text-4">none</div>
        ) : (
          enabled.map((fx) => (
            <div key={fx.id} className="pl-3.5">
              <span className="text-accent">{cssFnFor(fx)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function cssFnFor(fx: { type: EffectType; value: number }): string {
  switch (fx.type) {
    case 'brightness': return `brightness(${(1 + fx.value).toFixed(2)})`;
    case 'contrast':   return `contrast(${fx.value.toFixed(2)})`;
    case 'saturation': return `saturate(${fx.value.toFixed(2)})`;
    case 'blur':       return `blur(${fx.value.toFixed(1)}px)`;
  }
}
