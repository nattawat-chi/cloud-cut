/* global React */
// ============================================================
// Top bar — brand, project, presence, undo/redo, share, export
// ============================================================
const { stores, actions, useStore, helpers } = window.CC;
const { Icon } = window.CC;

function TopBar() {
  const project    = useStore(stores.projectStore, s => s.project);
  const tracks     = useStore(stores.projectStore, s => s.tracks);
  const clips      = useStore(stores.projectStore, s => s.clips);
  const history    = useStore(stores.historyStore, s => s);
  const collabs    = useStore(stores.collabStore, s => s.collaborators);
  const cursors    = useStore(stores.collabStore, s => s.cursors);
  const showPres   = useStore(stores.uiStore, s => s.showPresence);
  const showHist   = useStore(stores.uiStore, s => s.showHistoryPanel);
  const showShorts = useStore(stores.uiStore, s => s.showShortcuts);

  const canUndo = history.cursor >= 0;
  const canRedo = history.cursor < history.entries.length - 1;

  // Project stats
  const totalDur = clips.reduce((m, c) => Math.max(m, c.posMs + c.durMs), 0);

  return (
    <div className="topbar">
      <div className="topbar-section">
        <div className="brand">
          <div className="brand-mark">{Icon.Cloud(14)}</div>
          <span className="brand-name">CloudCut</span>
        </div>
        <span className="brand-sep crumb-sep-ws">/</span>
      </div>

      <div className="topbar-section shrinkable" style={{ flex: "1 1 auto" }}>
        <div className="proj-name">
          <span className="crumb crumb-ws">{project.workspace}</span>
          <span className="brand-sep crumb-sep-ws">/</span>
          <span className="title-text" title={project.name}>{project.name}</span>
        </div>
        <span className="save-state"><span className="dot"></span>Saved · just now</span>
      </div>

      <div className="topbar-stats">
        <span>{project.resolution}</span>
        <span style={{ color: "var(--text-4)" }}>·</span>
        <span>{project.fps}fps</span>
        <span style={{ color: "var(--text-4)" }}>·</span>
        <span>{helpers.fmtClipDur(totalDur)}</span>
      </div>

      <div style={{ width: 1, alignSelf: "stretch", margin: "8px 4px", background: "var(--line)", flexShrink: 0 }} />

      <div className="topbar-section">
        <button
          className="iconbtn"
          disabled={!canUndo}
          onClick={actions.undo}
          title="Undo (⌘Z)"
        >
          {Icon.Undo(14)}
        </button>
        <button
          className="iconbtn"
          disabled={!canRedo}
          onClick={actions.redo}
          title="Redo (⇧⌘Z)"
        >
          {Icon.Redo(14)}
        </button>
        <button
          className={"iconbtn " + (showHist ? "active" : "")}
          onClick={actions.toggleHistoryPanel}
          title="History"
        >
          {Icon.History(14)}
        </button>
      </div>

      <div style={{ width: 1, alignSelf: "stretch", margin: "8px 6px", background: "var(--line)" }} />

      {showPres && (
        <div className="topbar-section">
          <div className="presence">
            {collabs.map(c => {
              const isEditing = Object.values(cursors).some(cu => cu.label === c.name && cu.editingClipId);
              return (
                <div
                  key={c.id}
                  className={"avatar" + (isEditing ? " editing" : "")}
                  style={{ background: c.color }}
                  title={c.name + (isEditing ? " · editing" : "")}
                >
                  {c.initials}
                </div>
              );
            })}
            <div className="avatar you" style={{ background: "var(--bg-3)", color: "var(--text-1)" }} title="You">
              YU
            </div>
          </div>
        </div>
      )}

      <div style={{ width: 1, alignSelf: "stretch", margin: "8px 6px", background: "var(--line)" }} />

      <div className="topbar-section">
        <button
          className={"iconbtn " + (showShorts ? "active" : "")}
          onClick={actions.toggleShortcuts}
          title="Keyboard shortcuts (?)"
        >
          {Icon.Keyboard(14)}
        </button>
        <button className="iconbtn ghost-bordered" title="Share">
          {Icon.Share(13)} <span>Share</span>
        </button>
        <button className="iconbtn primary" title="Export">
          {Icon.Download(13)} <span>Export</span>
        </button>
      </div>
    </div>
  );
}

Object.assign(window.CC, { TopBar });
