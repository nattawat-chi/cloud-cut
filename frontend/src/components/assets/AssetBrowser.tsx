import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarIcon,
  ChevronDownIcon,
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
import { useAssetsHydration } from '@/hooks/useAssetsHydration';
import { usePermissions } from '@/hooks/usePermissions';
import { useAssetsStore } from '@/state/assetsStore';
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

type SortMode = 'recent' | 'name' | 'size';

const SORT_OPTIONS: ReadonlyArray<{ id: SortMode; label: string }> = [
  { id: 'recent', label: 'Most recent' },
  { id: 'name', label: 'Name (A→Z)' },
  { id: 'size', label: 'Size (largest)' },
];

/**
 * Quick filter by upload time. Windows are evaluated against `asset.createdAt`
 * — assets without a timestamp (e.g. mock fixtures) fall through to `all`.
 */
type TimeRange = 'all' | '24h' | '7d' | '30d';

const TIME_RANGE_OPTIONS: ReadonlyArray<{ id: TimeRange; label: string; windowMs: number | null }> = [
  { id: 'all', label: 'All time',     windowMs: null },
  { id: '24h', label: 'Last 24 hours', windowMs: 24 * 60 * 60 * 1000 },
  { id: '7d',  label: 'Last 7 days',   windowMs: 7  * 24 * 60 * 60 * 1000 },
  { id: '30d', label: 'Last 30 days',  windowMs: 30 * 24 * 60 * 60 * 1000 },
];

export function AssetBrowser() {
  const tab = useUIStore((s) => s.assetTab);
  const setTab = useUIStore((s) => s.setAssetTab);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('recent');
  const [timeRange, setTimeRange] = useState<TimeRange>('all');

  const workspaceId = useProjectStore((s) => s.currentWorkspaceId);
  const { canUpload } = usePermissions();
  const upload = useAssetUpload(workspaceId);
  const { loading, error } = useAssetsHydration(workspaceId);
  const items = useAssetsStore((s) => s.items);

  // Counts come from the live list — Filter tabs always show *current* totals.
  const counts = useMemo(
    () => ({
      all: items.length,
      video: items.filter((a) => a.type === 'video').length,
      audio: items.filter((a) => a.type === 'audio').length,
      image: items.filter((a) => a.type === 'image').length,
    }),
    [items],
  );

  const visible = useMemo(
    () => sortAssets(filterAssets(items, tab, query, timeRange), sort),
    [items, tab, query, sort, timeRange],
  );
  const inProgress = visible.filter((a) => a.status !== 'ready');
  const ready = visible.filter((a) => a.status === 'ready');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHead
        title="Assets"
        tools={
          <div className="flex items-center gap-1">
            <TimeFilterMenu value={timeRange} onChange={setTimeRange} />
            <SortMenu value={sort} onChange={setSort} />
          </div>
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
          title={
            !canUpload ? 'Viewer role — upload not allowed' :
            upload.state.uploading ? `Uploading… ${Math.round(upload.state.progress * 100)}%` : 'Upload'
          }
          onClick={upload.openPicker}
          disabled={!canUpload || upload.state.uploading || !workspaceId}
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
        {loading && items.length === 0 && (
          <div className="px-2 py-8 text-center text-[11px] text-text-4">Loading assets…</div>
        )}
        {error && (
          <div className="mx-2 mb-2 rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-[11px] text-danger">
            {error}
          </div>
        )}
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
        {!loading && visible.length === 0 && (
          <div className="px-2 py-8 text-center text-[11px] text-text-4">
            {query
              ? `No assets match “${query}”.`
              : timeRange !== 'all'
                ? `No assets uploaded in the ${TIME_RANGE_OPTIONS.find((o) => o.id === timeRange)?.label.toLowerCase()}.`
                : 'No assets yet — upload one to start.'}
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

interface SortMenuProps {
  value: SortMode;
  onChange: (mode: SortMode) => void;
}

function SortMenu({ value, onChange }: SortMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Click-outside close
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title="Sort assets"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'grid h-6 w-6 place-items-center rounded text-text-3 hover:bg-surface-3 hover:text-text-1',
          open && 'bg-surface-3 text-text-1',
        )}
      >
        <SlidersHorizontalIcon size={12} />
      </button>
      {open && (
        <div
          className={cn(
            'absolute right-0 top-7 z-30 w-36 overflow-hidden rounded-md border border-line',
            'bg-surface-2 py-1 shadow-lg',
          )}
        >
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                onChange(opt.id);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[11px]',
                value === opt.id ? 'text-accent' : 'text-text-2 hover:bg-surface-3 hover:text-text-1',
              )}
            >
              {opt.label}
              {value === opt.id && <span className="text-accent">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface TimeFilterMenuProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

function TimeFilterMenu({ value, onChange }: TimeFilterMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const current = TIME_RANGE_OPTIONS.find((o) => o.id === value) ?? TIME_RANGE_OPTIONS[0]!;
  const isFiltered = value !== 'all';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title={`Filter by upload time · currently: ${current.label}`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-6 items-center gap-1 rounded px-1.5 text-[10px]',
          isFiltered
            ? 'bg-accent/15 text-accent hover:bg-accent/25'
            : 'text-text-3 hover:bg-surface-3 hover:text-text-1',
          open && !isFiltered && 'bg-surface-3 text-text-1',
        )}
      >
        <CalendarIcon size={11} />
        {isFiltered && <span className="font-medium">{shortLabel(value)}</span>}
        <ChevronDownIcon size={9} />
      </button>
      {open && (
        <div
          className={cn(
            'absolute right-0 top-7 z-30 w-40 overflow-hidden rounded-md border border-line',
            'bg-surface-2 py-1 shadow-lg',
          )}
        >
          {TIME_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                onChange(opt.id);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[11px]',
                value === opt.id ? 'text-accent' : 'text-text-2 hover:bg-surface-3 hover:text-text-1',
              )}
            >
              {opt.label}
              {value === opt.id && <span className="text-accent">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function shortLabel(range: TimeRange): string {
  switch (range) {
    case '24h': return '24h';
    case '7d':  return '7d';
    case '30d': return '30d';
    default:    return '';
  }
}

function filterAssets(
  all: readonly Asset[],
  tab: AssetTab,
  query: string,
  timeRange: TimeRange,
): readonly Asset[] {
  let out: readonly Asset[] = tab === 'all' ? all : all.filter((a) => a.type === tab);
  const q = query.trim().toLowerCase();
  if (q) out = out.filter((a) => a.name.toLowerCase().includes(q));

  // Time-range filter — assets without a createdAt (mock data) are kept
  // visible so the local fixture still renders during offline dev.
  const windowMs = TIME_RANGE_OPTIONS.find((o) => o.id === timeRange)?.windowMs;
  if (windowMs != null) {
    const cutoff = Date.now() - windowMs;
    out = out.filter((a) => {
      if (!a.createdAt) return true;
      const t = Date.parse(a.createdAt);
      return Number.isFinite(t) && t >= cutoff;
    });
  }

  return out;
}

function sortAssets(all: readonly Asset[], mode: SortMode): readonly Asset[] {
  const copy = [...all];
  switch (mode) {
    case 'name':
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case 'size': {
      // Parse the human size back into a sortable number — assets are formatted
      // as "184 MB" / "1.2 GB" / "9.6 KB". For sorting we just rank by unit.
      const score = (s: string): number => {
        const n = parseFloat(s);
        if (s.includes('GB')) return n * 1024 * 1024 * 1024;
        if (s.includes('MB')) return n * 1024 * 1024;
        if (s.includes('KB')) return n * 1024;
        return n;
      };
      return copy.sort((a, b) => score(b.size) - score(a.size));
    }
    case 'recent':
    default:
      // Hydration returns assets in insertion order from the API, which is
      // already DESC by id (UUID v7 → time-sortable). Keep that.
      return copy;
  }
}
