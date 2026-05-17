import { FilmIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { fmtTC } from '@/utils/timecode';
import type { Asset, Clip } from '@/types';

import { SliderRow } from './SliderRow';

interface PropsTabProps {
  clip: Clip;
  asset: Asset | undefined;
}

/**
 * Properties tab — clip metadata (read-mostly) + transform sliders
 * (uncontrolled today; wired to `projectStore.updateClipTransform` in
 * Phase 1.6+ when drag-on-canvas lands).
 */
export function PropsTab({ clip, asset }: PropsTabProps) {
  return (
    <div className="flex-1 overflow-y-auto px-3.5 pb-10 pt-3">
      <Section title="Clip">
        <Row label="Name">
          <Input defaultValue={clip.name} />
        </Row>
        <Row label="Source">
          <div className="flex items-center gap-1.5 text-[11px] text-text-2">
            <FilmIcon size={11} />
            <span className="font-mono truncate">{asset?.name ?? '—'}</span>
          </div>
        </Row>
        <Row label="Track">
          <div className="font-mono text-[11px] text-text-2">
            {clip.trackId.replace('tr_', '').toUpperCase()}
          </div>
        </Row>
        <Row label="Position">
          <Input mono defaultValue={`${(clip.posMs / 1000).toFixed(2)}s`} />
        </Row>
        <Row label="Duration">
          <Input mono defaultValue={`${(clip.durMs / 1000).toFixed(2)}s`} />
        </Row>
        <Row label="In">
          <Input mono defaultValue={fmtTC(clip.inPointMs)} />
        </Row>
        <Row label="Out">
          <Input mono defaultValue={fmtTC(clip.outPointMs)} />
        </Row>
      </Section>

      <Section
        title="Transform"
        tools={
          <button
            type="button"
            className="rounded px-1.5 text-[10px] text-text-3 hover:bg-surface-3 hover:text-text-1"
            style={{ height: 20 }}
          >
            Reset
          </button>
        }
      >
        <SliderRow label="X"        min={-1000} max={1000} step={1}    init={clip.transform.x}        unit="px" />
        <SliderRow label="Y"        min={-1000} max={1000} step={1}    init={clip.transform.y}        unit="px" />
        <SliderRow label="Scale"    min={0.1}   max={3}    step={0.01} init={clip.transform.scale}    unit="×"  />
        <SliderRow label="Rotation" min={-180}  max={180}  step={1}    init={clip.transform.rotation} unit="°"  />
        <SliderRow label="Opacity"  min={0}     max={1}    step={0.01} init={clip.transform.opacity}            />
      </Section>
    </div>
  );
}

/* ─── primitives ─── */

function Section({
  title,
  tools,
  children,
}: {
  title: string;
  tools?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-3">
          {title}
        </span>
        {tools}
      </div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1 grid grid-cols-[70px_1fr] items-center gap-2">
      <label className="text-[11px] text-text-3">{label}</label>
      {children}
    </div>
  );
}

function Input({ mono, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return (
    <input
      {...props}
      className={cn(
        'h-6 w-full rounded-sm border border-line bg-surface-2 px-1.5 text-[11px] text-text-1 outline-none',
        'focus:border-accent',
        mono && 'font-mono',
        props.className,
      )}
    />
  );
}
