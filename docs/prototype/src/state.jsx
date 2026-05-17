/* global React */
// ============================================================
// CloudCut — State stores (project, ui, playback, history, collab)
// Simple pub/sub global store; React components subscribe via hook.
// ============================================================
const { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } = React;

// ---- helpers ----------------------------------------------
function fmtTC(ms, fps = 30) {
  if (ms < 0) ms = 0;
  const total = Math.round(ms);
  const sTotal = Math.floor(total / 1000);
  const h  = Math.floor(sTotal / 3600);
  const m  = Math.floor((sTotal % 3600) / 60);
  const s  = sTotal % 60;
  const f  = Math.floor((total % 1000) / (1000 / fps));
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
}

function fmtClipDur(ms) {
  const sTotal = ms / 1000;
  if (sTotal < 60) return `${sTotal.toFixed(1)}s`;
  const m = Math.floor(sTotal / 60);
  const s = Math.round(sTotal % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function uid(p = "c") { return `${p}_${Math.random().toString(36).slice(2, 9)}`; }

// ---- pub/sub store ----------------------------------------
function makeStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set: (updater) => {
      const next = typeof updater === "function" ? updater(state) : { ...state, ...updater };
      state = next;
      subs.forEach(fn => fn(state));
    },
    sub: (fn) => { subs.add(fn); return () => subs.delete(fn); },
  };
}

function useStore(store, selector = s => s) {
  const [, force] = useState(0);
  const selectedRef = useRef(selector(store.get()));
  useEffect(() => {
    const unsub = store.sub((s) => {
      const next = selector(s);
      if (!Object.is(next, selectedRef.current)) {
        selectedRef.current = next;
        force(n => n + 1);
      }
    });
    return unsub;
  }, [store, selector]);
  selectedRef.current = selector(store.get());
  return selectedRef.current;
}

// ---- project store: clips, tracks, effects ----------------
const projectStore = makeStore({
  project: window.CC.PROJECT,
  tracks: window.CC.TRACKS,
  clips: window.CC.CLIPS,
  // per-clip effect state (with params, enabled)
  effects: {
    c1: [{ id: "fx1", type: "brightness", enabled: true, value: 0.08 }],
    c2: [
      { id: "fx2", type: "contrast",   enabled: true, value: 1.18 },
      { id: "fx3", type: "saturation", enabled: true, value: 1.10 },
    ],
    c4: [
      { id: "fx4", type: "brightness", enabled: true, value: 0.05 },
      { id: "fx5", type: "blur",       enabled: false, value: 2 },
    ],
    c6: [{ id: "fx6", type: "saturation", enabled: true, value: 1.25 }],
  },
});

// ---- UI store ---------------------------------------------
const uiStore = makeStore({
  selectedClipIds: ["c2"],
  selectedAssetTab: "all",
  zoomPxPerSec: 50,    // mutable via tweaks/+-
  scrollX: 0,
  snapEnabled: true,
  activeTool: "select",
  inspectorTab: "props",
  // overlays
  showShortcuts: false,
  showEffectsBrowser: false,
  showHistoryPanel: false,
  // panel sizes (px)
  leftW: 280,
  rightW: 340,
  bottomH: 320,
  // tracks visibility for tweak "trackPreset"
  visibleTracks: ["tr_v1","tr_v2","tr_a1","tr_a2"],
  clipStyle: "rich",     // 'rich' (thumbs+waves) | 'thumb' | 'wave' | 'flat'
  showPresence: true,
  toasts: [],
});

// ---- Playback store ---------------------------------------
const playbackStore = makeStore({
  currentMs: 8200,
  playing: false,
  speed: 1,
  volume: 0.85,
  muted: false,
});

// ---- History store ----------------------------------------
const historyStore = makeStore({
  entries: window.CC.INITIAL_HISTORY.map((h, i) => ({ ...h, undone: false, idx: i })),
  cursor: window.CC.INITIAL_HISTORY.length - 1,
});

// ---- Collab store -----------------------------------------
const collabStore = makeStore({
  collaborators: window.CC.COLLABORATORS,
  // cursor positions in viewport (x,y) updated by simulator
  cursors: {
    u_alice: { x: 0.65, y: 0.55, target: "viewport", visible: true, label: "Alice K.", editingClipId: null },
    u_mira:  { x: 0.30, y: 0.78, target: "timeline", visible: true, label: "Mira S.",  editingClipId: "c6", timelineMs: 12500 },
    u_dev:   { x: 0.45, y: 0.18, target: "viewport", visible: true, label: "Devon R.", editingClipId: null },
  },
});

// ===========================================================
// Actions
// ===========================================================
const actions = {
  // -- selection
  selectClip(id, additive = false) {
    uiStore.set(s => {
      if (!additive) return { ...s, selectedClipIds: [id] };
      const sel = new Set(s.selectedClipIds);
      sel.has(id) ? sel.delete(id) : sel.add(id);
      return { ...s, selectedClipIds: [...sel] };
    });
  },
  deselectAll() { uiStore.set({ selectedClipIds: [] }); },

  // -- timeline mutations
  moveClip(id, newPosMs, newTrackId) {
    projectStore.set(s => ({
      ...s,
      clips: s.clips.map(c => c.id === id ? { ...c, posMs: Math.max(0, newPosMs), trackId: newTrackId || c.trackId } : c)
    }));
    historyStore.set(s => actions._pushHistory(s, { type: "clip.move", desc: `Moved clip`, who: "You" }));
  },
  trimClip(id, side, newDurMs) {
    projectStore.set(s => ({
      ...s,
      clips: s.clips.map(c => c.id === id ? { ...c, durMs: Math.max(400, newDurMs) } : c)
    }));
    historyStore.set(s => actions._pushHistory(s, { type: "clip.trim", desc: `Trimmed ${side}`, who: "You" }));
  },
  deleteSelected() {
    const ids = new Set(uiStore.get().selectedClipIds);
    if (!ids.size) return;
    projectStore.set(s => ({ ...s, clips: s.clips.filter(c => !ids.has(c.id)) }));
    uiStore.set({ selectedClipIds: [] });
    historyStore.set(s => actions._pushHistory(s, { type: "clip.delete", desc: `Deleted ${ids.size} clip${ids.size>1?"s":""}`, who: "You" }));
  },
  splitAtPlayhead() {
    const t = playbackStore.get().currentMs;
    const ids = new Set(uiStore.get().selectedClipIds);
    projectStore.set(s => {
      const out = [];
      for (const c of s.clips) {
        if (ids.has(c.id) && t > c.posMs + 200 && t < c.posMs + c.durMs - 200) {
          const left  = { ...c, durMs: t - c.posMs };
          const right = { ...c, id: uid(), posMs: t, durMs: c.posMs + c.durMs - t, thumbs: (c.thumbs || []).slice(Math.floor((c.thumbs||[]).length / 2)) };
          out.push(left, right);
        } else { out.push(c); }
      }
      return { ...s, clips: out };
    });
    historyStore.set(s => actions._pushHistory(s, { type: "clip.split", desc: `Split at playhead`, who: "You" }));
  },

  // -- effects
  toggleEffect(clipId, fxId) {
    projectStore.set(s => {
      const list = (s.effects[clipId] || []).map(fx => fx.id === fxId ? { ...fx, enabled: !fx.enabled } : fx);
      return { ...s, effects: { ...s.effects, [clipId]: list } };
    });
    historyStore.set(s => actions._pushHistory(s, { type: "effect.update", desc: "Toggled effect", who: "You" }));
  },
  updateEffect(clipId, fxId, value) {
    projectStore.set(s => {
      const list = (s.effects[clipId] || []).map(fx => fx.id === fxId ? { ...fx, value } : fx);
      return { ...s, effects: { ...s.effects, [clipId]: list } };
    });
  },
  addEffect(clipId, type) {
    projectStore.set(s => {
      const defaults = { brightness: 0.0, contrast: 1.0, saturation: 1.0, blur: 0 };
      const fx = { id: uid("fx"), type, enabled: true, value: defaults[type] ?? 1 };
      return { ...s, effects: { ...s.effects, [clipId]: [...(s.effects[clipId] || []), fx] } };
    });
    historyStore.set(s => actions._pushHistory(s, { type: "effect.add", desc: `Added ${type}`, who: "You" }));
  },
  removeEffect(clipId, fxId) {
    projectStore.set(s => {
      const list = (s.effects[clipId] || []).filter(fx => fx.id !== fxId);
      return { ...s, effects: { ...s.effects, [clipId]: list } };
    });
    historyStore.set(s => actions._pushHistory(s, { type: "effect.delete", desc: `Removed effect`, who: "You" }));
  },

  // -- track tools
  toggleTrack(trackId, key) {
    projectStore.set(s => ({
      ...s,
      tracks: s.tracks.map(t => t.id === trackId ? { ...t, [key]: !t[key] } : t),
    }));
  },

  // -- playback
  play() { playbackStore.set({ playing: true }); },
  pause() { playbackStore.set({ playing: false }); },
  togglePlay() { playbackStore.set(s => ({ ...s, playing: !s.playing })); },
  seek(ms) {
    const dur = projectStore.get().project.durationMs;
    playbackStore.set({ currentMs: Math.max(0, Math.min(dur, ms)) });
  },
  setVolume(v) { playbackStore.set({ volume: Math.max(0, Math.min(1, v)) }); },
  toggleMute() { playbackStore.set(s => ({ ...s, muted: !s.muted })); },
  setSpeed(s) { playbackStore.set({ speed: s }); },

  // -- zoom & scroll
  setZoom(px) { uiStore.set({ zoomPxPerSec: Math.max(15, Math.min(200, px)) }); },
  zoomIn() { uiStore.set(s => ({ ...s, zoomPxPerSec: Math.min(200, s.zoomPxPerSec * 1.25) })); },
  zoomOut() { uiStore.set(s => ({ ...s, zoomPxPerSec: Math.max(15, s.zoomPxPerSec / 1.25) })); },
  zoomFit() { uiStore.set({ zoomPxPerSec: 32, scrollX: 0 }); },
  setScrollX(x) { uiStore.set({ scrollX: Math.max(0, x) }); },
  toggleSnap() { uiStore.set(s => ({ ...s, snapEnabled: !s.snapEnabled })); },
  setTool(t) { uiStore.set({ activeTool: t }); },

  // -- undo / redo
  _pushHistory(state, entry) {
    const { entries, cursor } = state;
    const truncated = entries.slice(0, cursor + 1).map(e => ({ ...e, undone: false }));
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")}`;
    const next = [...truncated, { id: uid("h"), ts, ...entry }];
    return { entries: next, cursor: next.length - 1 };
  },
  undo() {
    historyStore.set(s => {
      if (s.cursor < 0) return s;
      const entries = s.entries.map((e,i) => i === s.cursor ? { ...e, undone: true } : e);
      return { ...s, entries, cursor: s.cursor - 1 };
    });
    actions.toast({ who: "You", body: "Undo" });
  },
  redo() {
    historyStore.set(s => {
      if (s.cursor >= s.entries.length - 1) return s;
      const nc = s.cursor + 1;
      const entries = s.entries.map((e,i) => i === nc ? { ...e, undone: false } : e);
      return { ...s, entries, cursor: nc };
    });
  },
  jumpHistory(idx) {
    historyStore.set(s => {
      const entries = s.entries.map((e,i) => ({ ...e, undone: i > idx }));
      return { ...s, entries, cursor: idx };
    });
  },

  // -- overlays
  toggleShortcuts() { uiStore.set(s => ({ ...s, showShortcuts: !s.showShortcuts })); },
  toggleEffectsBrowser() { uiStore.set(s => ({ ...s, showEffectsBrowser: !s.showEffectsBrowser })); },
  toggleHistoryPanel() { uiStore.set(s => ({ ...s, showHistoryPanel: !s.showHistoryPanel })); },

  // -- toasts
  toast({ who, body }) {
    const id = uid("t");
    uiStore.set(s => ({ ...s, toasts: [...s.toasts, { id, who, body, t: Date.now() }] }));
    setTimeout(() => {
      uiStore.set(s => ({ ...s, toasts: s.toasts.filter(t => t.id !== id) }));
    }, 4000);
  },
  dismissToast(id) {
    uiStore.set(s => ({ ...s, toasts: s.toasts.filter(t => t.id !== id) }));
  },

  // -- panel sizes
  setLeftW(w)   { uiStore.set({ leftW: Math.max(200, Math.min(500, w)) }); },
  setRightW(w)  { uiStore.set({ rightW: Math.max(240, Math.min(520, w)) }); },
  setBottomH(h) { uiStore.set({ bottomH: Math.max(180, Math.min(560, h)) }); },

  // -- tweaks application
  applyTweaks(t) {
    // Theme
    document.documentElement.dataset.theme = t.theme || "dark";

    // Accent — full color string (oklch/hex)
    const accent = t.accent || "oklch(0.82 0.16 165)";
    document.documentElement.style.setProperty("--accent", accent);
    // Ink (text on accent) — pick dark for light accents, white for dark accents
    // Heuristic: parse lightness from oklch, else default
    let ink = "oklch(0.15 0.02 260)";
    const m = /oklch\(\s*([0-9.]+)/.exec(accent);
    if (m && parseFloat(m[1]) < 0.55) ink = "oklch(0.98 0.005 90)";
    document.documentElement.style.setProperty("--accent-ink", ink);
    // accent-soft (with alpha)
    if (accent.startsWith("oklch(")) {
      const inner = accent.slice(6, -1);
      document.documentElement.style.setProperty("--accent-soft", `oklch(${inner} / 0.16)`);
    } else {
      document.documentElement.style.setProperty("--accent-soft", accent);
    }

    uiStore.set({
      snapEnabled: !!t.snap,
      zoomPxPerSec: Math.max(15, Math.min(200, (t.zoom || 1) * 50)),
      clipStyle: t.clipStyle || "rich",
      showPresence: t.presence !== false,
      showShortcuts: !!t.shortcuts,
    });

    // track preset
    if (t.trackPreset === "minimal") {
      uiStore.set({ visibleTracks: ["tr_v1","tr_a1"] });
    } else if (t.trackPreset === "audio-heavy") {
      uiStore.set({ visibleTracks: ["tr_v1","tr_a1","tr_a2"] });
    } else {
      uiStore.set({ visibleTracks: ["tr_v1","tr_v2","tr_a1","tr_a2"] });
    }
  },
};

window.CC.stores = { projectStore, uiStore, playbackStore, historyStore, collabStore };
window.CC.actions = actions;
window.CC.useStore = useStore;
window.CC.helpers = { fmtTC, fmtClipDur, uid };
