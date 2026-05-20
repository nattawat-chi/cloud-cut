import { useEffect } from 'react';

import { useHistoryStore } from '@/state/historyStore';
import { usePlaybackStore } from '@/state/playbackStore';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';

const FRAME_MS = 1000 / 30;

/**
 * Global keyboard shortcuts. Attaches a single `window keydown` listener for
 * the lifetime of the App.
 *
 * Skipped while focus is on a text input / textarea / contenteditable so the
 * user can still type into the Inspector name field or the asset search box.
 *
 * Reads stores via `getState()` rather than React selectors — the listener
 * is registered once and reads fresh values per event, so no re-binding
 * happens when state changes.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;

      const ui = useUIStore.getState();
      const playback = usePlaybackStore.getState();
      const project = useProjectStore.getState();
      const history = useHistoryStore.getState();

      const cmd = e.metaKey || e.ctrlKey;

      // ── Cmd combos ─────────────────────────────────────────────────────
      if (cmd && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
        return;
      }
      if (cmd && e.key === '0') { e.preventDefault(); ui.zoomFit(); return; }
      if (cmd && (e.key === '+' || e.key === '=')) { e.preventDefault(); ui.zoomIn(); return; }
      if (cmd && e.key === '-') { e.preventDefault(); ui.zoomOut(); return; }
      if (cmd && e.key.toLowerCase() === 'c') {
        if (ui.selectedClipIds.length === 0) return;
        e.preventDefault();
        project.copyClips(ui.selectedClipIds);
        return;
      }
      if (cmd && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        project.pasteClips();
        return;
      }
      if (cmd && e.key.toLowerCase() === 'a') {
        // Select-all: useful alongside copy/paste and Del. Skip when there
        // are no clips so we don't fight the browser's text-select shortcut
        // on non-editor surfaces.
        if (project.clips.length === 0) return;
        e.preventDefault();
        ui.setSelection(project.clips.map((c) => c.id));
        return;
      }
      if (cmd) return; // ignore other cmd combos to avoid swallowing browser shortcuts

      // ── Single-key shortcuts ───────────────────────────────────────────
      switch (e.key) {
        case ' ':
          e.preventDefault();
          playback.togglePlay();
          break;
        case 'v': case 'V': ui.setTool('select'); break;
        case 'b': case 'B': ui.setTool('blade');  break;
        case 'h': case 'H': ui.setTool('hand');   break;
        case 's': case 'S': {
          const t = playback.currentTimeMs;
          for (const id of ui.selectedClipIds) project.splitClipAt(id, t);
          break;
        }
        case 'n': case 'N': ui.toggleSnap(); break;
        case '?':           ui.toggleShortcuts(); break;
        case 'Delete':
        case 'Backspace':   project.deleteClips(ui.selectedClipIds); break;
        case 'Home':        playback.seek(0); break;
        case 'End':
          playback.seek(project.project?.durationMs ?? 0);
          break;
        case 'ArrowLeft':
          playback.seek(playback.currentTimeMs - (e.shiftKey ? 1000 : FRAME_MS));
          break;
        case 'ArrowRight':
          playback.seek(playback.currentTimeMs + (e.shiftKey ? 1000 : FRAME_MS));
          break;
        default: break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
