/* global React */
// ============================================================
// Collab — simulated remote cursor + presence motion
// ============================================================
const { stores: cStores, actions: cActions, useStore: cUse } = window.CC;
const { useEffect: cFx, useState: cSt, useRef: cRef } = React;

// Run a scripted "movie" of remote actions so it feels alive but isn't chaotic.
// Each step lives ~3s; loops.
const SCRIPT = [
  // [time-offset-ms, who, patch]
  {  whoId: "u_alice", patch: { target: "viewport", x: 0.62, y: 0.42, editingClipId: null,  label: "Alice K." } },
  {  whoId: "u_mira",  patch: { target: "timeline", timelineMs: 12500, editingClipId: "c6", label: "Mira S." } },
  {  whoId: "u_dev",   patch: { target: "viewport", x: 0.45, y: 0.20, editingClipId: null,  label: "Devon R." } },

  {  whoId: "u_alice", patch: { target: "viewport", x: 0.30, y: 0.50, editingClipId: null,  label: "Alice K." } },
  {  whoId: "u_mira",  patch: { target: "timeline", timelineMs: 20800, editingClipId: "c3", label: "Mira S." } },

  {  whoId: "u_alice", patch: { target: "timeline", timelineMs: 6700,  editingClipId: "c2", label: "Alice K." } },
  {  whoId: "u_dev",   patch: { target: "viewport", x: 0.78, y: 0.62, editingClipId: null,  label: "Devon R." } },

  {  whoId: "u_alice", patch: { target: "timeline", timelineMs: 9200,  editingClipId: "c2", label: "Alice K." } },
  {  whoId: "u_mira",  patch: { target: "viewport", x: 0.18, y: 0.30, editingClipId: null,  label: "Mira S." } },

  {  whoId: "u_alice", patch: { target: "viewport", x: 0.74, y: 0.30, editingClipId: null,  label: "Alice K." } },
  {  whoId: "u_mira",  patch: { target: "timeline", timelineMs: 4200,  editingClipId: "c8", label: "Mira S." } },
  {  whoId: "u_dev",   patch: { target: "viewport", x: 0.55, y: 0.74, editingClipId: null,  label: "Devon R." } },
];

const TOAST_SCRIPT = [
  // Sparse toasts at indices in SCRIPT
  { atStep: 4, toast: { who: "Mira S.", body: "Moved demo_result.mp4 to 20.8s" } },
  { atStep: 7, toast: { who: "Alice K.", body: "Updated brightness on feature_walkthrough.mp4" } },
];

function CollabSimulator() {
  const showPres = cUse(cStores.uiStore, s => s.showPresence);

  cFx(() => {
    if (!showPres) {
      cStores.collabStore.set(s => ({
        ...s,
        cursors: Object.fromEntries(Object.entries(s.cursors).map(([k,v]) => [k, { ...v, visible: false }])),
      }));
      return;
    }
    cStores.collabStore.set(s => ({
      ...s,
      cursors: Object.fromEntries(Object.entries(s.cursors).map(([k,v]) => [k, { ...v, visible: true }])),
    }));
    let i = 0;
    const tick = () => {
      const step = SCRIPT[i % SCRIPT.length];
      cStores.collabStore.set(s => ({
        ...s,
        cursors: { ...s.cursors, [step.whoId]: { ...s.cursors[step.whoId], ...step.patch, visible: true } },
      }));
      // toasts on this step
      const t = TOAST_SCRIPT.find(x => x.atStep === (i % SCRIPT.length));
      if (t) cActions.toast(t.toast);
      i++;
    };
    tick();
    const id = setInterval(tick, 3500);
    return () => clearInterval(id);
  }, [showPres]);

  return null;
}

function ViewportCursors() {
  const cursors = cUse(cStores.collabStore, s => s.cursors);
  const showPres = cUse(cStores.uiStore, s => s.showPresence);
  if (!showPres) return null;
  return (
    <>
      {Object.entries(cursors).map(([uid, cu]) => {
        if (cu.target !== "viewport" || !cu.visible) return null;
        const collab = window.CC.COLLABORATORS.find(c => c.name === cu.label);
        const left = `${cu.x * 100}%`;
        const top  = `${cu.y * 100}%`;
        return (
          <div key={uid} className="dom-cursor" style={{ left, top, transform: "translate(-2px, -2px)", "--c": collab?.color }}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M5 3 L19 12 L13 14 L11 21 Z" fill={`var(--c)`} stroke="white" strokeWidth="0.8"/>
            </svg>
            <div className="label" style={{ "--c": collab?.color, background: collab?.color }}>{cu.label}</div>
          </div>
        );
      })}
    </>
  );
}

Object.assign(window.CC, { CollabSimulator, ViewportCursors });
