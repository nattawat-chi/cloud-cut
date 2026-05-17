import { useState } from 'react';

import { cn } from '@/lib/utils';

interface SliderRowProps {
  label: string;
  min: number;
  max: number;
  step: number;
  /** Initial value — uncontrolled. Pass `value`/`onChange` to make controlled. */
  init?: number;
  value?: number;
  onChange?: (v: number) => void;
  unit?: string;
  /** Optional value formatter — defaults to `toFixed(step decimals) + unit`. */
  fmt?: (v: number) => string;
  className?: string;
  disabled?: boolean;
}

/**
 * Reusable [label | slider | value] row used by both PropsTab (Transform
 * fieldset) and EffectsTab (per-effect parameter). Supports controlled and
 * uncontrolled variants so PropsTab can defer state until Phase 1.6 wires
 * `updateClipTransform`, while EffectsTab can drive the projectStore today.
 */
export function SliderRow({
  label,
  min,
  max,
  step,
  init = 0,
  value,
  onChange,
  unit = '',
  fmt,
  className,
  disabled,
}: SliderRowProps) {
  const [internal, setInternal] = useState(init);
  const isControlled = value !== undefined;
  const v = isControlled ? value : internal;
  const decimals = Number.isInteger(step) ? 0 : Math.max(0, -Math.floor(Math.log10(step)));
  const formatted = fmt ? fmt(v) : `${v.toFixed(decimals)}${unit}`;

  const handle = (next: number) => {
    if (!isControlled) setInternal(next);
    onChange?.(next);
  };

  return (
    <div
      className={cn(
        'mb-1 grid items-center gap-2',
        'grid-cols-[70px_1fr_46px]',
        disabled && 'opacity-50',
        className,
      )}
    >
      <label className="text-[11px] text-text-3">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        disabled={disabled}
        onChange={(e) => handle(parseFloat(e.target.value))}
        className="cc-insp-slider h-1 w-full cursor-pointer appearance-none rounded-sm bg-surface-3"
      />
      <div className="font-mono text-right text-[11px] text-text-1">{formatted}</div>
    </div>
  );
}
