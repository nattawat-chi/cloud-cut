/* global React, ReactDOM */
// ============================================================
// CloudCut — App entry
// ============================================================
const { stores: appStores, actions: appActions, useStore: appUse } = window.CC;
const { TopBar, AssetBrowser, VideoPlayer, InspectorPanel, Timeline,
        CollabSimulator, ViewportCursors, ShortcutsOverlay, EffectsBrowser,
        HistoryPanel, ToastStack, CCTweaks } = window.CC;
const { useEffect: aFx, useRef: aRef } = React;

function VResizer({ side }) {
  const onDown = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = side === "left"
      ? appStores.uiStore.get().leftW
      : appStores.uiStore.get().rightW;
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      if (side === "left") appActions.setLeftW(startW + dx);
      else                 appActions.setRightW(startW - dx);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  return <div className="resizer resizer-v" onMouseDown={onDown}/>;
}

function HResizer() {
  const onDown = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = appStores.uiStore.get().bottomH;
    const onMove = (ev) => {
      const dy = ev.clientY - startY;
      appActions.setBottomH(startH - dy);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  return <div className="resizer resizer-h" onMouseDown={onDown}/>;
}

function useKeyboardShortcuts() {
  aFx(() => {
    const onKey = (e) => {
      // Don't fire while typing in inputs
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;

      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) appActions.redo(); else appActions.undo();
        return;
      }
      if (cmd && e.key === "0") { e.preventDefault(); appActions.zoomFit(); return; }
      if (cmd && (e.key === "+" || e.key === "=")) { e.preventDefault(); appActions.zoomIn(); return; }
      if (cmd && e.key === "-") { e.preventDefault(); appActions.zoomOut(); return; }
      if (cmd) return; // skip other cmd combos

      switch (e.key) {
        case " ":      e.preventDefault(); appActions.togglePlay(); break;
        case "v": case "V": appActions.setTool("select"); break;
        case "b": case "B": appActions.setTool("blade"); break;
        case "h": case "H": appActions.setTool("hand"); break;
        case "s": case "S": appActions.splitAtPlayhead(); break;
        case "n": case "N": appActions.toggleSnap(); break;
        case "?":      appActions.toggleShortcuts(); break;
        case "Delete":
        case "Backspace": appActions.deleteSelected(); break;
        case "Home":   appActions.seek(0); break;
        case "End":    appActions.seek(appStores.projectStore.get().project.durationMs); break;
        case "ArrowLeft":  appActions.seek(appStores.playbackStore.get().currentMs - (e.shiftKey ? 1000 : 1000/30)); break;
        case "ArrowRight": appActions.seek(appStores.playbackStore.get().currentMs + (e.shiftKey ? 1000 : 1000/30)); break;
        default: break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function App() {
  const leftW   = appUse(appStores.uiStore, s => s.leftW);
  const rightW  = appUse(appStores.uiStore, s => s.rightW);
  const bottomH = appUse(appStores.uiStore, s => s.bottomH);

  useKeyboardShortcuts();

  const mainStyle = { "--bottom-h": bottomH + "px" };
  const upperStyle = { "--left-w": leftW + "px", "--right-w": rightW + "px" };

  return (
    <div className="app" style={mainStyle}>
      <TopBar />
      <div className="main" style={mainStyle}>
        <div className="upper" style={upperStyle}>
          <div className="panel left" style={{ position: "relative" }}>
            <AssetBrowser />
            <VResizer side="left"/>
            <div style={{ position: "absolute", top: 0, bottom: 0, right: -1, width: 3, cursor: "col-resize" }} onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startW = leftW;
              const onMove = (ev) => appActions.setLeftW(startW + (ev.clientX - startX));
              const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
              document.addEventListener("mousemove", onMove);
              document.addEventListener("mouseup", onUp);
            }}/>
          </div>
          <div className="panel center" style={{ position: "relative" }}>
            <VideoPlayer />
            <ViewportCursors />
            <div style={{ position: "absolute", top: 0, bottom: 0, right: -1, width: 3, cursor: "col-resize", zIndex: 10 }} onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startW = rightW;
              const onMove = (ev) => appActions.setRightW(startW - (ev.clientX - startX));
              const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
              document.addEventListener("mousemove", onMove);
              document.addEventListener("mouseup", onUp);
            }}/>
          </div>
          <div className="panel right">
            <InspectorPanel />
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: -2, height: 4, cursor: "row-resize", zIndex: 10 }} onMouseDown={(e) => {
            e.preventDefault();
            const startY = e.clientY;
            const startH = bottomH;
            const onMove = (ev) => appActions.setBottomH(startH - (ev.clientY - startY));
            const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
          }}/>
          <Timeline />
        </div>
      </div>

      <CollabSimulator />
      <HistoryPanel />
      <ShortcutsOverlay />
      <EffectsBrowser />
      <ToastStack />
      <CCTweaks />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
