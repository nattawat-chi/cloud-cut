import { Trash2Icon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useProjectStore } from '@/state/projectStore';
import { EFFECT_META } from '@/types';
import type { ClipEffect, UUID } from '@/types';

interface EffectEditorProps {
  clipId: UUID;
  fx: ClipEffect;
}

/**
 * Single effect card — toggle switch (sets `enabled`), slider for the value,
 * remove button. All three actions hit the projectStore directly so the
 * player's CSS-filter preview updates immediately.
 */
export function EffectEditor({ clipId, fx }: EffectEditorProps) {
  const toggleEffect = useProjectStore((s) => s.toggleEffect);
  const updateEffect = useProjectStore((s) => s.updateEffect);
  const removeEffect = useProjectStore((s) => s.removeEffect);
  const meta = EFFECT_META[fx.type];

  return (
    <div
      className={cn(
        'mb-1.5 rounded-md border border-line bg-surface-2 px-2.5 py-2',
        !fx.enabled && 'opacity-50',
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-text-1">
          <button
            type="button"
            role="switch"
            aria-checked={fx.enabled}
            onClick={() => toggleEffect(clipId, fx.id)}
            className={cn(
              'relative h-3.5 w-6 shrink-0 cursor-pointer rounded-full transition-colors',
              fx.enabled ? 'bg-accent' : 'bg-surface-3',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-2.5 w-2.5 rounded-full transition-all',
                fx.enabled ? 'left-3 bg-accent-foreground' : 'left-0.5 bg-text-2',
              )}
            />
          </button>
          {meta.label}
        </div>
        <button
          type="button"
          title="Remove"
          onClick={() => removeEffect(clipId, fx.id)}
          className="grid h-5 w-5 place-items-center rounded text-text-3 hover:bg-surface-3 hover:text-text-1"
        >
          <Trash2Icon size={11} />
        </button>
      </div>

      <div className="grid items-center gap-2" style={{ gridTemplateColumns: '1fr 46px' }}>
        <input
          type="range"
          min={meta.min}
          max={meta.max}
          step={meta.step}
          value={fx.value}
          disabled={!fx.enabled}
          onChange={(e) => updateEffect(clipId, fx.id, parseFloat(e.target.value))}
          className="cc-insp-slider h-1 w-full cursor-pointer appearance-none rounded-sm bg-surface-3"
        />
        <div className="font-mono text-right text-[11px] text-text-1">{meta.fmt(fx.value)}</div>
      </div>
    </div>
  );
}
