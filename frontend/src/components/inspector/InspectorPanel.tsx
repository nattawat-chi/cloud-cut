import { EyeIcon, LayersIcon, MousePointerIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { PanelHead } from '@/components/shared/PanelHead';
import { MOCK_ASSET_INDEX as MOCK_ASSET_INDEX_FALLBACK } from '@/mocks/cloudcut';
import { usePermissions } from '@/hooks/usePermissions';
import { useAssetsStore } from '@/state/assetsStore';
import {
  selectClipById,
  useProjectStore,
} from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import type { InspectorTab } from '@/types';

import { EffectsTab } from './EffectsTab';
import { ClipInfo } from './ClipInfo';

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
  // ── ALL hooks must run unconditionally on every render — see the React
  // Rules of Hooks. The previous version called useAssetsStore *after* the
  // early-return guards, which caused the hook count to differ between
  // renders and crashed the editor with "Rendered more hooks than during
  // the previous render" the first time a clip got selected/deselected.
  const selectedIds = useUIStore((s) => s.selectedClipIds);
  const tab = useUIStore((s) => s.inspectorTab);
  const setTab = useUIStore((s) => s.setInspectorTab);
  const { canEditTimeline } = usePermissions();
  const readOnly = !canEditTimeline;

  const firstId = selectedIds[0];
  const clip = useProjectStore((s) =>
    firstId ? selectClipById(firstId)(s) : undefined,
  );

  // Live workspace asset for the selected clip — falls back to the mock index
  // when running offline (loadMockProject mode). The selector handles
  // !clip safely so the hook still runs in the empty-selection branch.
  const liveAsset = useAssetsStore((s) =>
    clip ? s.byId[clip.assetId] : undefined,
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

  const asset = liveAsset ?? MOCK_ASSET_INDEX_FALLBACK[clip.assetId];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHead title="Inspector" />

      {/* Tabs */}
      <div className="flex items-center border-b border-line px-2">
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
        {readOnly && (
          <span className="ml-auto flex items-center gap-1 rounded-sm bg-surface-3 px-1.5 py-0.5 text-[9px] text-text-4">
            <EyeIcon size={9} />
            View only
          </span>
        )}
      </div>

      {tab === 'props' && <ClipInfo clip={clip} asset={asset} readOnly={readOnly} />}
      {tab === 'effects' && <EffectsTab clip={clip} readOnly={readOnly} />}
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
