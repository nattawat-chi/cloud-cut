/* global React */
// ============================================================
// Overlays — shortcuts modal, effects browser, undo history,
// toast stack
// ============================================================
const { stores: oStores, actions: oActions, useStore: oUse } = window.CC;
const { Icon: oIcon } = window.CC;

const SHORTCUTS = [
  { sec: "Playback", rows: [
    { keys: ["Space"], desc: "Play / Pause" },
    { keys: ["J"], desc: "Reverse" },
    { keys: ["K"], desc: "Pause" },
    { keys: ["L"], desc: "Forward" },
    { keys: ["←","→"], desc: "Step 1 frame" },
    { keys: ["⇧","←"], desc: "Step 10 frames" },
    { keys: ["Home"], desc: "Go to start" },
    { keys: ["End"], desc: "Go to end" },
  ]},
  { sec: "Editing", rows: [
    { keys: ["V"], desc: "Select tool" },
    { keys: ["B"], desc: "Blade tool" },
    { keys: ["H"], desc: "Hand tool" },
    { keys: ["S"], desc: "Split at playhead" },
    { keys: ["I"], desc: "Mark In" },
    { keys: ["O"], desc: "Mark Out" },
    { keys: ["Del"], desc: "Delete selected" },
    { keys: ["⌘","D"], desc: "Duplicate" },
  ]},
  { sec: "Timeline", rows: [
    { keys: ["⌘","+"], desc: "Zoom in" },
    { keys: ["⌘","-"], desc: "Zoom out" },
    { keys: ["⌘","0"], desc: "Zoom to fit" },
    { keys: ["N"], desc: "Toggle snap" },
    { keys: ["Alt"], desc: "Disable snap (hold)" },
    { keys: ["⌘","Z"], desc: "Undo" },
    { keys: ["⇧","⌘","Z"], desc: "Redo" },
    { keys: ["?"], desc: "This panel" },
  ]},
];

function ShortcutsOverlay() {
  const open = oUse(oStores.uiStore, s => s.showShortcuts);
  if (!open) return null;
  return (
    <div className="overlay-backdrop" onClick={oActions.toggleShortcuts}>
      <div className="overlay-card" onClick={e => e.stopPropagation()}>
        <div className="overlay-head">
          <h2>Keyboard shortcuts</h2>
          <button className="iconbtn" onClick={oActions.toggleShortcuts}>{oIcon.X(14)}</button>
        </div>
        <div className="overlay-body">
          <div className="shortcuts-grid">
            {SHORTCUTS.map(sec => (
              <div key={sec.sec} className="shortcut-sec">
                <h3>{sec.sec}</h3>
                {sec.rows.map(r => (
                  <div key={r.desc} className="shortcut-row">
                    <span style={{ color: "var(--text-2)" }}>{r.desc}</span>
                    <span className="keys">{r.keys.map((k,i) => <kbd key={i}>{k}</kbd>)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const FX_LIBRARY = [
  { id: "brightness", cat: "Color",      name: "Brightness",  preview: "linear-gradient(120deg, oklch(0.78 0.08 60), oklch(0.85 0.10 80))" },
  { id: "contrast",   cat: "Color",      name: "Contrast",    preview: "linear-gradient(120deg, oklch(0.95 0.02 260), oklch(0.18 0.01 260))" },
  { id: "saturation", cat: "Color",      name: "Saturation",  preview: "linear-gradient(120deg, oklch(0.7 0.20 30), oklch(0.7 0.20 290))" },
  { id: "hue",        cat: "Color",      name: "Hue shift",   preview: "conic-gradient(from 0deg, oklch(0.7 0.18 0), oklch(0.7 0.18 120), oklch(0.7 0.18 240), oklch(0.7 0.18 360))" },
  { id: "blur",       cat: "Stylize",    name: "Gaussian blur", preview: "linear-gradient(120deg, oklch(0.6 0.10 230), oklch(0.4 0.08 280)) blur(8px)" },
  { id: "sharpen",    cat: "Stylize",    name: "Sharpen",     preview: "repeating-linear-gradient(45deg, oklch(0.4 0.04 260) 0 4px, oklch(0.6 0.06 260) 4px 8px)" },
  { id: "grain",      cat: "Stylize",    name: "Film grain",  preview: "radial-gradient(circle at 30% 40%, oklch(0.7 0.05 60), oklch(0.4 0.04 60))" },
  { id: "vignette",   cat: "Stylize",    name: "Vignette",    preview: "radial-gradient(circle, oklch(0.65 0.10 30) 0%, oklch(0.18 0.02 30) 90%)" },
  { id: "chroma-key", cat: "Composite",  name: "Chroma key",  preview: "linear-gradient(120deg, oklch(0.78 0.20 145), oklch(0.5 0.10 145))" },
  { id: "luma-key",   cat: "Composite",  name: "Luma key",    preview: "linear-gradient(120deg, oklch(0.95 0 0), oklch(0.18 0 0))" },
  { id: "speed",      cat: "Time",       name: "Speed ramp",  preview: "linear-gradient(60deg, oklch(0.5 0.13 220), oklch(0.7 0.15 280))" },
  { id: "reverse",    cat: "Time",       name: "Reverse",     preview: "linear-gradient(240deg, oklch(0.6 0.13 30), oklch(0.45 0.10 60))" },
];

function EffectsBrowser() {
  const open = oUse(oStores.uiStore, s => s.showEffectsBrowser);
  if (!open) return null;
  const close = () => oActions.toggleEffectsBrowser();
  return (
    <div className="overlay-backdrop" onClick={close}>
      <div className="overlay-card" onClick={e => e.stopPropagation()}>
        <div className="overlay-head">
          <h2>Effects browser</h2>
          <button className="iconbtn" onClick={close}>{oIcon.X(14)}</button>
        </div>
        <div className="overlay-body">
          <div className="fx-grid">
            {FX_LIBRARY.map(fx => (
              <div key={fx.id} className="fx-card" onClick={() => {
                const sel = oStores.uiStore.get().selectedClipIds[0];
                if (sel && ["brightness","contrast","saturation","blur"].includes(fx.id)) {
                  oActions.addEffect(sel, fx.id);
                }
                close();
              }}>
                <div className="fx-preview" style={{ background: fx.preview }}/>
                <div className="fx-label">
                  <span className="name">{fx.name}</span>
                  <span className="cat">{fx.cat}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryPanel() {
  const open = oUse(oStores.uiStore, s => s.showHistoryPanel);
  const hist = oUse(oStores.historyStore, s => s);
  if (!open) return null;
  return (
    <div className="history-panel">
      <div className="history-head">
        <span>History</span>
        <div style={{ display: "flex", gap: 2 }}>
          <button className="iconbtn" onClick={oActions.undo} disabled={hist.cursor < 0} title="Undo">{oIcon.Undo(11)}</button>
          <button className="iconbtn" onClick={oActions.redo} disabled={hist.cursor >= hist.entries.length - 1} title="Redo">{oIcon.Redo(11)}</button>
          <button className="iconbtn" onClick={oActions.toggleHistoryPanel}>{oIcon.X(11)}</button>
        </div>
      </div>
      <div className="history-list">
        {hist.entries.slice().reverse().map((e, idx) => {
          const realIdx = hist.entries.length - 1 - idx;
          const isCurrent = realIdx === hist.cursor;
          return (
            <div
              key={e.id}
              className={"history-item" + (isCurrent ? " current" : "") + (e.undone ? " undone" : "")}
              onClick={() => oActions.jumpHistory(realIdx)}
              title={`${e.who} · ${e.ts}`}
            >
              <div style={{ display: "flex", alignItems: "center", overflow: "hidden" }}>
                <span className="icon">
                  {e.type.startsWith("clip") && oIcon.Film(10)}
                  {e.type.startsWith("effect") && oIcon.Sparkle(10)}
                </span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.desc}</span>
              </div>
              <span className="time">{e.ts}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ToastStack() {
  const toasts = oUse(oStores.uiStore, s => s.toasts);
  return (
    <div className="toast-stack">
      {toasts.map(t => (
        <div key={t.id} className="toast" onClick={() => oActions.dismissToast(t.id)}>
          <div className="toast-head">{t.who} <span className="who">· just now</span></div>
          <div className="toast-body">{t.body}</div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window.CC, { ShortcutsOverlay, EffectsBrowser, HistoryPanel, ToastStack });
