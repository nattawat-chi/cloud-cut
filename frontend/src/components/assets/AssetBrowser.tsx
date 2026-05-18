import { useMemo, useState } from 'react';
import {
  FilmIcon,
  ImageIcon,
  MusicIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  UploadIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { PanelHead } from '@/components/shared/PanelHead';
import { useAssetUpload } from '@/hooks/useAssetUpload';
import { MOCK_ASSETS } from '@/mocks/cloudcut';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import type { Asset, AssetTab } from '@/types';

import { AssetRow } from './AssetRow';

const TABS: ReadonlyArray<{ id: AssetTab; label: string; icon: typeof FilmIcon | null }> = [
  { id: 'all',   label: 'All',   icon: null },
  { id: 'video', label: 'Video', icon: FilmIcon },
  { id: 'audio', label: 'Audio', icon: MusicIcon },
  { id: 'image', label: 'Image', icon: ImageIcon },
];

export function AssetBrowser() {
  const tab = useUIStore((s) => s.assetTab);
  const setTab = useUIStore((s) => s.setAssetTab);
  const [query, setQuery] = useState('');

  const workspaceId = useProjectStore((s) => s.project?.workspace ?? null);
  const upload = useAssetUpload(workspaceId);

  // Counts are over the full asset list (not the active tab) — matches the
  // prototype where the badge next to each tab always shows total of that type.
  const counts = useMemo(
    () => ({
      all: MOCK_ASSETS.length,
      video: MOCK_ASSETS.filter((a) => a.type === 'video').length,
      audio: MOCK_ASSETS.filter((a) => a.type === 'audio').length,
      image: MOCK_ASSETS.filter((a) => a.type === 'image').length,
    }),
    [],
  );

  const visible = useMemo(() => filterAssets(MOCK_ASSETS, tab, query), [tab, query]);
  const inProgress = visible.filter((a) => a.status !== 'ready');
  const ready = visible.filter((a) => a.status === 'ready');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHead
        title="Assets"
        tools={
          <button
            type="button"
            title="Filter"
            className="grid h-6 w-6 place-items-center rounded text-text-3 hover:bg-surface-3 hover:text-text-1"
          >
            <SlidersHorizontalIcon size={12} />
          </button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-line px-2.5 pt-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-[1.5px] px-2.5 py-1.5 text-[11px]',
              tab === id
                ? 'border-accent text-text-1'
                : 'border-transparent text-text-3 hover:text-text-2',
            )}
          >
            {Icon && <Icon size={12} />}
            <span className="capitalize">{label}</span>
            <span className="text-[10px] text-text-4">{counts[id]}</span>
          </button>
        ))}
      </div>

      {/* Search + Upload */}
      <div className="flex gap-1.5 px-3 py-2.5">
        <div className="relative flex-1">
          <SearchIcon
            size={14}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-text-3"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search assets…"
            className={cn(
              'h-7 w-full rounded-md border border-line bg-surface-2 pl-7 pr-2',
              'text-xs text-text-1 outline-none placeholder:text-text-3',
              'focus:border-accent',
            )}
          />
        </div>
        <button
          type="button"
          title={upload.state.uploading ? `Uploading… ${Math.round(upload.state.progress * 100)}%` : 'Upload'}
          onClick={upload.openPicker}
          disabled={upload.state.uploading || !workspaceId}
          className={cn(
            'grid h-7 w-7 place-items-center rounded-md border border-dashed border-line bg-surface-2',
            'text-text-2 hover:border-accent hover:text-accent disabled:opacity-50',
          )}
        >
          <UploadIcon size={14} />
        </button>
        <input
          ref={upload.inputRef}
          type="file"
          accept="video/*,audio/*,image/*"
          onChange={upload.onPickerChange}
          className="hidden"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-3 pt-1">
        {inProgress.length > 0 && (
          <>
            <SectionTitle>In progress · {inProgress.length}</SectionTitle>
            {inProgress.map((a) => (
              <AssetRow key={a.id} asset={a} />
            ))}
          </>
        )}
        {ready.length > 0 && (
          <>
            <SectionTitle>Ready · {ready.length}</SectionTitle>
            {ready.map((a) => (
              <AssetRow key={a.id} asset={a} />
            ))}
          </>
        )}
        {visible.length === 0 && (
          <div className="px-2 py-8 text-center text-[11px] text-text-4">
            No assets match “{query}”.
          </div>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pb-1 pt-3 text-[10px] uppercase tracking-[0.08em] text-text-4">
      {children}
    </div>
  );
}

function filterAssets(
  all: readonly Asset[],
  tab: AssetTab,
  query: string,
): readonly Asset[] {
  let out: readonly Asset[] = tab === 'all' ? all : all.filter((a) => a.type === tab);
  const q = query.trim().toLowerCase();
  if (q) out = out.filter((a) => a.name.toLowerCase().includes(q));
  return out;
}
