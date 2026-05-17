/* global React */
// ============================================================
// Timeline — bottom panel
// Tracks, clips (with thumbs/waveforms), ruler, playhead, snap,
// drag, collab cursors
// ============================================================
const { stores: tStores, actions: tActions, useStore: tUse, helpers: tHelp } = window.CC;
const { Icon: tIcon } = window.CC;
const { useEffect: tFx, useRef: tRef, useState: tSt, useMemo: tMemo, useCallback: tCb } = React;

// ----- Waveform SVG generator (deterministic per clip id) ----
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = ((h<<5) - h) + s.charCodeAt(i); return Math.abs(h); }
function waveformPath(clip, w, h) {
  // Generate ~120 vertical bars w/ deterministic peaks
  const seed = hashStr(clip.id);
  const bars = Math.max(40, Math.min(220, Math.floor(w / 3)));
  const rand = (i) => {
    const x = Math.sin(seed * 0.013 + i * 0.37) * 10000;
    return (x - Math.floor(x));
  };
  // envelope: louder middle for music, varied for VO
  const isMusic = clip.trackId === "tr_a2";
  let parts = [];
  for (let i = 0; i < bars; i++) {
    const t = i / bars;
    const env = isMusic ? 0.85 - Math.abs(t - 0.5) * 0.2 : Math.min(1, 0.4 + rand(i*3) * 0.9);
    const peak = rand(i) * env;
    const dip  = -rand(i+2) * env;
    const x = (i + 0.5) * (w / bars);
    const y1 = h/2 - peak * (h/2 - 1);
    const y2 = h/2 - dip * (h/2 - 1);
    parts.push(`M${x.toFixed(1)} ${y1.toFixed(1)} L${x.toFixed(1)} ${y2.toFixed(1)}`);
  }
  return parts.join(" ");
}

function ClipBody({ clip, track, style: clipStyle, widthPx }) {
  if (track.type === "audio") {
    if (clipStyle === "flat") return <div className="clip-flat"/>;
    return (
      <svg className="clip-waveform" preserveAspectRatio="none" viewBox={`0 0 ${Math.max(widthPx, 20)} 40`}>
        <path d={waveformPath(clip, Math.max(widthPx, 20), 40)} stroke="rgba(255,255,255,0.75)" strokeWidth="1" fill="none"/>
      </svg>
    );
  }
  // video
  if (clipStyle === "flat") return <div className="clip-flat"/>;
  if (clipStyle === "wave") {
    // hint of waveform on video too, for stylized variant
    return (
      <svg className="clip-waveform" preserveAspectRatio="none" viewBox={`0 0 ${Math.max(widthPx, 20)} 40`}>
        <path d={waveformPath(clip, Math.max(widthPx, 20), 40)} stroke="rgba(255,255,255,0.3)" strokeWidth="1" fill="none"/>
      </svg>
    );
  }
  // 'rich' or 'thumb' — render thumbnail strip
  const thumbs = clip.thumbs || [];
  const n = Math.max(1, Math.min(thumbs.length, Math.max(2, Math.floor(widthPx / 60))));
  const slots = Array.from({ length: n }, (_, i) => thumbs[Math.floor(i * thumbs.length / n)] || thumbs[0]);
  return (
    <div className="clip-thumbs">
      {slots.map((g, i) => (
        <div key={i} className="clip-thumb" style={{ background: g }}/>
      ))}
    </div>
  );
}

function Clip({ clip, track, pxPerMs, selected, beingEditedBy, onMouseDown }) {
  const left = clip.posMs * pxPerMs;
  const w = clip.durMs * pxPerMs;
  const clipStyle = tUse(tStores.uiStore, s => s.clipStyle);
  const clipColor = `var(${track.colorVar})`;
  return (
    <div
      className={"tl-clip" + (selected ? " selected" : "") + (beingEditedBy ? " being-edited" : "")}
      style={{ left: left + "px", width: w + "px", "--clip-color": clipColor }}
      onMouseDown={(e) => onMouseDown(e, clip)}
      onDoubleClick={() => { tActions.selectClip(clip.id); }}
      title={clip.name}
    >
      <div className="clip-label">{clip.name}</div>
      <ClipBody clip={clip} track={track} style={clipStyle} widthPx={w}/>
      {clip.fx && clip.fx.length > 0 && (
        <div className="clip-fx-pip">
          {clip.fx.slice(0, 3).map((_, i) => <div key={i} className="pip"/>)}
        </div>
      )}
      <div className="clip-dur mono">{tHelp.fmtClipDur(clip.durMs)}</div>
      <div className="trim-handle left"/>
      <div className="trim-handle right"/>
    </div>
  );
}

function Ruler({ widthPx, pxPerSec, scrollX, onSeek }) {
  // Determine tick interval based on zoom
  const minTickPx = 60;
  let secStep = 1;
  const steps = [0.5, 1, 2, 5, 10, 30, 60];
  for (const s of steps) {
    if (s * pxPerSec >= minTickPx) { secStep = s; break; }
  }
  const totalSec = widthPx / pxPerSec;
  const ticks = [];
  const minorStep = secStep / 5;
  for (let s = 0; s <= totalSec; s += minorStep) {
    const isMajor = Math.abs(s / secStep - Math.round(s / secStep)) < 1e-6;
    const x = s * pxPerSec;
    ticks.push(
      <div key={s.toFixed(3)} className={"tl-tick " + (isMajor ? "" : "minor")} style={{ left: x + "px" }}>
        {isMajor && formatRulerTime(s)}
      </div>
    );
  }
  return (
    <div className="tl-ruler" onMouseDown={(e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left + scrollX;
      onSeek((x / pxPerSec) * 1000);
      const onMove = (ev) => {
        const xx = ev.clientX - rect.left + scrollX;
        onSeek((xx / pxPerSec) * 1000);
      };
      const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    }}>
      <div className="tl-ruler-track" style={{ width: widthPx + "px" }}>
        {ticks}
      </div>
    </div>
  );
}

function formatRulerTime(sec) {
  if (sec < 60) return `${sec.toFixed(sec < 1 && sec > 0 ? 1 : 0)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2,"0")}`;
}

function TrackHeader({ track }) {
  return (
    <div className="tl-track-head">
      <div className="swatch" style={{ background: `var(${track.colorVar})` }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tl-track-name">{track.label}</div>
        <div style={{ display: "flex", gap: 5, alignItems: "center", marginTop: 3 }}>
          <span className="tl-track-tag">{track.type === "video" ? "VIDEO" : "AUDIO"}</span>
        </div>
      </div>
      <div className="tl-track-tools">
        <button className={"iconbtn " + (track.muted ? "muted" : "on")} onClick={() => tActions.toggleTrack(track.id, "muted")} title="Mute">
          {track.muted ? tIcon.VolumeMute(11) : tIcon.Volume(11)}
        </button>
        <button className={"iconbtn " + (track.locked ? "muted" : "on")} onClick={() => tActions.toggleTrack(track.id, "locked")} title="Lock">
          {track.locked ? tIcon.Lock(11) : tIcon.Unlock(11)}
        </button>
        <button className={"iconbtn " + (track.visible ? "on" : "")} onClick={() => tActions.toggleTrack(track.id, "visible")} title="Visibility">
          {track.visible ? tIcon.Eye(11) : tIcon.EyeOff(11)}
        </button>
      </div>
    </div>
  );
}

function Timeline() {
  const tracks    = tUse(tStores.projectStore, s => s.tracks);
  const clips     = tUse(tStores.projectStore, s => s.clips);
  const project   = tUse(tStores.projectStore, s => s.project);
  const selected  = tUse(tStores.uiStore, s => s.selectedClipIds);
  const zoomPxPS  = tUse(tStores.uiStore, s => s.zoomPxPerSec);
  const snap      = tUse(tStores.uiStore, s => s.snapEnabled);
  const tool      = tUse(tStores.uiStore, s => s.activeTool);
  const visTracks = tUse(tStores.uiStore, s => s.visibleTracks);
  const currentMs = tUse(tStores.playbackStore, s => s.currentMs);
  const cursors   = tUse(tStores.collabStore, s => s.cursors);
  const showPres  = tUse(tStores.uiStore, s => s.showPresence);

  const pxPerSec = zoomPxPS;
  const pxPerMs = pxPerSec / 1000;
  const majorSec = pxPerSec >= 80 ? 1 : pxPerSec >= 40 ? 2 : 5;
  const contentWidth = Math.max(1600, project.durationMs * pxPerMs + 200);

  const visibleTrackList = tracks.filter(t => visTracks.includes(t.id));

  const scrollRef = tRef(null);
  const [scrollX, setScrollX] = tSt(0);
  const onScroll = () => setScrollX(scrollRef.current?.scrollLeft || 0);

  const [snapLineX, setSnapLineX] = tSt(null);

  // -- clip drag handler --
  const dragRef = tRef(null);
  const onClipMouseDown = (e, clip) => {
    e.preventDefault();
    tActions.selectClip(clip.id, e.shiftKey);
    if (tool === "blade") {
      // split where clicked
      const tlRect = scrollRef.current.querySelector(".tl-inner").getBoundingClientRect();
      const xInTimeline = e.clientX - tlRect.left;
      const t = xInTimeline / pxPerMs;
      tStores.playbackStore.set({ currentMs: t });
      tActions.splitAtPlayhead();
      return;
    }
    const startX = e.clientX;
    const startPos = clip.posMs;
    dragRef.current = { id: clip.id, startX, startPos, moved: false };

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dMs = dx / pxPerMs;
      let newPos = Math.max(0, startPos + dMs);
      let snapped = null;
      if (snap && !ev.altKey) {
        // snap to nearby clip edges + playhead
        const candidates = [];
        for (const c of clips) {
          if (c.id === clip.id) continue;
          candidates.push(c.posMs, c.posMs + c.durMs);
        }
        candidates.push(currentMs);
        candidates.push(0);
        const threshold = 14 / pxPerMs;  // 14px
        for (const t of candidates) {
          if (Math.abs(newPos - t) < threshold) { newPos = t; snapped = t; break; }
          if (Math.abs((newPos + clip.durMs) - t) < threshold) { newPos = t - clip.durMs; snapped = t; break; }
        }
      }
      setSnapLineX(snapped !== null ? snapped * pxPerMs : null);
      dragRef.current.moved = true;
      tStores.projectStore.set(s => ({
        ...s,
        clips: s.clips.map(c => c.id === clip.id ? { ...c, posMs: newPos } : c),
      }));
    };
    const onUp = () => {
      setSnapLineX(null);
      if (dragRef.current?.moved) {
        tStores.historyStore.set(s => window.CC.actions._pushHistory(s, { type: "clip.move", desc: `Moved ${clip.name}`, who: "You" }));
      }
      dragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // ----- ruler styling: major grid var ------------
  const rowStyle = { "--major-px": (majorSec * pxPerSec) + "px" };

  return (
    <div className="timeline">
      <TimelineToolbar pxPerSec={pxPerSec} snap={snap} tool={tool}/>
      <div className="tl-stage">
        <div className="tl-headers" style={{ transform: `translateY(${0}px)` }}>
          <div className="tl-headers-spacer"/>
          <div className="tl-headers-rows">
            {visibleTrackList.map(tr => <TrackHeader key={tr.id} track={tr}/>)}
          </div>
        </div>

        <div className="tl-content">
          <div className="tl-scroll" ref={scrollRef} onScroll={onScroll}>
            <div className="tl-inner" style={{ width: contentWidth + "px" }}>
              <Ruler widthPx={contentWidth} pxPerSec={pxPerSec} scrollX={scrollX} onSeek={tActions.seek}/>

              <div className="tl-rows" style={rowStyle}>
                {visibleTrackList.map((tr, ti) => {
                  const trackClips = clips.filter(c => c.trackId === tr.id);
                  return (
                    <div key={tr.id} className="tl-row">
                      {trackClips.map(c => (
                        <Clip
                          key={c.id}
                          clip={c}
                          track={tr}
                          pxPerMs={pxPerMs}
                          selected={selected.includes(c.id)}
                          beingEditedBy={
                            Object.values(cursors).find(cu => cu.editingClipId === c.id)?.label || null
                          }
                          onMouseDown={onClipMouseDown}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>

              {/* Playhead */}
              <div className="tl-playhead" style={{ left: (currentMs * pxPerMs) + "px", top: 0, bottom: 0 }}/>

              {/* Snap guide */}
              {snapLineX !== null && (
                <div className="tl-snap-line" style={{ left: snapLineX + "px", top: 0, bottom: 0 }}/>
              )}

              {/* Collab cursors on timeline */}
              {showPres && Object.entries(cursors).map(([uid, cu]) => {
                if (cu.target !== "timeline" || !cu.visible || cu.timelineMs == null) return null;
                const x = cu.timelineMs * pxPerMs;
                const collab = window.CC.COLLABORATORS.find(c => c.name === cu.label);
                return (
                  <div key={uid} className="collab-cursor" style={{ left: x + "px", "--c": collab?.color, top: 0, bottom: 0 }}>
                    <div className="name" style={{ "--c": collab?.color }}>{cu.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineToolbar({ pxPerSec, snap, tool }) {
  const showHistory = tUse(tStores.uiStore, s => s.showHistoryPanel);
  return (
    <div className="tl-toolbar">
      <div className="tl-tool-group">
        <button className={"tl-tool " + (tool === "select" ? "active" : "")} onClick={() => tActions.setTool("select")} title="Select (V)">{tIcon.Cursor(13)}</button>
        <button className={"tl-tool " + (tool === "blade" ? "active" : "")}  onClick={() => tActions.setTool("blade")}  title="Blade / Split (S)">{tIcon.Scissors(13)}</button>
        <button className={"tl-tool " + (tool === "hand" ? "active" : "")}   onClick={() => tActions.setTool("hand")}   title="Hand (H)">{tIcon.Hand(13)}</button>
      </div>

      <div style={{ width: 1, height: 18, background: "var(--line)" }}/>

      <button className="iconbtn" onClick={() => tActions.splitAtPlayhead()} title="Split at playhead (S)">
        {tIcon.Scissors(12)} <span style={{ fontSize: 11 }}>Split</span>
      </button>
      <button className="iconbtn" onClick={() => tActions.deleteSelected()} title="Delete selected (Del)">
        {tIcon.Trash(12)}
      </button>

      <div style={{ width: 1, height: 18, background: "var(--line)" }}/>

      <button className={"tl-snap-toggle " + (snap ? "on" : "")} onClick={tActions.toggleSnap} title="Snap (N)">
        {tIcon.Magnet(11)} <span>Snap</span>
      </button>

      <div className="tl-grow"/>

      <div className="tl-zoom">
        <button className="iconbtn" onClick={tActions.zoomOut}>{tIcon.Minus(11)}</button>
        <span className="tl-zoom-val mono">{Math.round(pxPerSec)}px/s</span>
        <button className="iconbtn" onClick={tActions.zoomIn}>{tIcon.Plus(11)}</button>
        <button className="iconbtn" onClick={tActions.zoomFit} title="Zoom to fit (⌘0)" style={{ fontSize: 10, padding: "0 8px" }}>Fit</button>
      </div>
    </div>
  );
}

Object.assign(window.CC, { Timeline });
