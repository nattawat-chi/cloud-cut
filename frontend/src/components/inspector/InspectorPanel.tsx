import { LayersIcon, MousePointerIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { PanelHead } from '@/components/shared/PanelHead';
import { MOCK_ASSET_INDEX } from '@/mocks/cloudcut';
import {
  selectClipById,
  useProjectStore,
} from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import type { InspectorTab } from '@/types';

import { EffectsTab } from './EffectsTab';
import { PropsTab } from './PropsTab';

const TABS: ReadonlyArray<{ id: InspectorTab; label: string; disabled?: boolean }> = [
  { id: 'props',   label: 'Properties' },
  { id: 'effects', label: 'Effects' },
  { id: 'audio',   label: 'Audio', disabled: true },
];

/**
 * Right-hand inspector — three states:
 *   - 0 selected: hint
 *   - >1 selected: count summary
 *   - exactly 1 selected: PropsTab or EffectsTab depending on `inspectorTab`
 */
export function InspectorPanel() {
  const selectedIds = useUIStore((s) => s.selectedClipIds);
  const tab = useUIStore((s) => s.inspectorTab);
  const setTab = useUIStore((s) => s.setInspectorTab);

  // selectClipById takes an id at call time; calling it with a fixed id
  // returns a stable selector function for Zustand's equality check.
  const firstId = selectedIds[0];
  const clip = useProjectStore((s) =>
    firstId ? selectClipById(firstId)(s) : undefined,
  );

  if (selectedIds.length === 0 || !clip) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PanelHead title="Inspector" />
        <EmptyState icon={<MousePointerIcon size={20} />}>
          Select a clip on the timeline
          <br />
          to edit properties &amp; effects.
        </EmptyState>
      </div>
    );
  }

  if (selectedIds.length > 1) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PanelHead title="Inspector" />
        <EmptyState icon={<LayersIcon size={20} />}>
          <strong className="text-text-2">{selectedIds.length} clips</strong> selected
          <br />
          <span className="text-[11px]">Choose one to edit</span>
        </EmptyState>
      </div>
    );
  }

  const asset = MOCK_ASSET_INDEX[clip.assetId];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHead title="Inspector" />

      {/* Tabs */}
      <div className="flex border-b border-line px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={t.disabled}
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px border-b-[1.5px] px-2.5 py-2.5 text-[11px] uppercase tracking-[0.06em]',
              tab === t.id
                ? 'border-accent text-text-1'
                : 'border-transparent text-text-3',
              t.disabled
                ? 'cursor-default opacity-30'
                : 'cursor-pointer hover:text-text-2',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'props' && <PropsTab clip={clip} asset={asset} />}
      {tab === 'effects' && <EffectsTab clip={clip} />}
      {tab === 'audio' && null}
    </div>
  );
}

function EmptyState({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid flex-1 place-items-center gap-3 p-10 text-center text-xs text-text-4">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-surface-2 text-text-3">
        {icon}
      </div>
      <div>{children}</div>
    </div>
  );
}
