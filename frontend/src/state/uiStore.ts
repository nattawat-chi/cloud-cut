import { create } from 'zustand';

import type {
  AssetTab,
  ClipStyle,
  InspectorTab,
  Theme,
  Tool,
  TrackPreset,
  UUID,
} from '@/types';

/* =============================================================================
   uiStore — session-only state. Never touches the server.
   - Selection (`selectedClipIds`)
   - Tools (`activeTool`)
   - Viewport (`zoomLevel`, `scrollX`)
   - Theme (`theme`) — replaces the standalone useTheme hook from Phase 1.2
   - Panel/overlay visibility
   - Inspector/asset tab pickers
   - Tweaks-panel surfaces (`clipStyle`, `showPresence`, `trackPreset`)
   ============================================================================= */

const THEME_STORAGE_KEY = 'cloudcut:theme';

function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function persistTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // localStorage may be unavailable (private mode, embedded iframe, …);
    // theme state still works in-memory.
  }
  document.documentElement.dataset.theme = theme;
}

export interface UIState {
  // ── Selection ─────────────────────────────────────────────────────────────
  selectedClipIds: readonly UUID[];

  // ── Tools + viewport ──────────────────────────────────────────────────────
  activeTool: Tool;
  /** 0.3 – 4.0; mapped to px/s by `utils/geometry.ts#pxPerSec`. */
  zoomLevel: number;
  scrollX: number;
  snapEnabled: boolean;

  // ── Tabs / pickers ────────────────────────────────────────────────────────
  assetTab: AssetTab;
  inspectorTab: InspectorTab;

  // ── Tweaks surfaces ───────────────────────────────────────────────────────
  clipStyle: ClipStyle;
  showPresence: boolean;
  trackPreset: TrackPreset;

  // ── Theme ─────────────────────────────────────────────────────────────────
  theme: Theme;

  // ── Overlay visibility ────────────────────────────────────────────────────
  showShortcuts: boolean;
  showEffectsBrowser: boolean;
  showHistoryPanel: boolean;
  showExportDialog: boolean;

  // ── Actions ───────────────────────────────────────────────────────────────
  selectClip: (id: UUID, additive?: boolean) => void;
  deselectAll: () => void;

  setTool: (t: Tool) => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomFit: () => void;
  setScrollX: (x: number) => void;
  toggleSnap: () => void;

  setAssetTab: (tab: AssetTab) => void;
  setInspectorTab: (tab: InspectorTab) => void;

  setClipStyle: (style: ClipStyle) => void;
  setShowPresence: (on: boolean) => void;
  setTrackPreset: (preset: TrackPreset) => void;

  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;

  toggleShortcuts: () => void;
  toggleExportDialog: () => void;
  toggleEffectsBrowser: () => void;
  toggleHistoryPanel: () => void;
}

const initialTheme = readInitialTheme();
if (typeof document !== 'undefined') {
  document.documentElement.dataset.theme = initialTheme;
}

export const useUIStore = create<UIState>()((set) => ({
  selectedClipIds: ['c2'],

  activeTool: 'select',
  zoomLevel: 1.2,
  scrollX: 0,
  snapEnabled: true,

  assetTab: 'all',
  inspectorTab: 'props',

  clipStyle: 'rich',
  showPresence: true,
  trackPreset: 'demo',

  theme: initialTheme,

  showShortcuts: false,
  showExportDialog: false,
  showEffectsBrowser: false,
  showHistoryPanel: false,

  // ── Selection ───────────────────────────────────────────────────────────
  selectClip: (id, additive = false) =>
    set((s) => {
      if (!additive) return { selectedClipIds: [id] };
      const sel = new Set(s.selectedClipIds);
      if (sel.has(id)) sel.delete(id);
      else sel.add(id);
      return { selectedClipIds: [...sel] };
    }),
  deselectAll: () => set({ selectedClipIds: [] }),

  // ── Tools + viewport ─────────────────────────────────────────────────────
  setTool: (t) => set({ activeTool: t }),
  setZoom: (zoom) => set({ zoomLevel: Math.max(0.3, Math.min(4, zoom)) }),
  zoomIn: () => set((s) => ({ zoomLevel: Math.min(4, s.zoomLevel * 1.25) })),
  zoomOut: () => set((s) => ({ zoomLevel: Math.max(0.3, s.zoomLevel / 1.25) })),
  zoomFit: () => set({ zoomLevel: 0.64, scrollX: 0 }),
  setScrollX: (x) => set({ scrollX: Math.max(0, x) }),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),

  // ── Tabs ─────────────────────────────────────────────────────────────────
  setAssetTab: (tab) => set({ assetTab: tab }),
  setInspectorTab: (tab) => set({ inspectorTab: tab }),

  // ── Tweaks ───────────────────────────────────────────────────────────────
  setClipStyle: (style) => set({ clipStyle: style }),
  setShowPresence: (on) => set({ showPresence: on }),
  setTrackPreset: (preset) => set({ trackPreset: preset }),

  // ── Theme ────────────────────────────────────────────────────────────────
  setTheme: (theme) => {
    persistTheme(theme);
    set({ theme });
  },
  toggleTheme: () =>
    set((s) => {
      const next: Theme = s.theme === 'dark' ? 'light' : 'dark';
      persistTheme(next);
      return { theme: next };
    }),

  // ── Overlays ─────────────────────────────────────────────────────────────
  toggleShortcuts: () => set((s) => ({ showShortcuts: !s.showShortcuts })),
  toggleExportDialog: () => set((s) => ({ showExportDialog: !s.showExportDialog })),
  toggleEffectsBrowser: () => set((s) => ({ showEffectsBrowser: !s.showEffectsBrowser })),
  toggleHistoryPanel: () => set((s) => ({ showHistoryPanel: !s.showHistoryPanel })),
}));
