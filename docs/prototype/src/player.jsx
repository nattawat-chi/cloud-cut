/* global React */
// ============================================================
// Video Player — center panel
// ============================================================
const { stores: pStores, actions: pActions, useStore: pUse, helpers: pHelp } = window.CC;
const { Icon: pIcon } = window.CC;
const { useEffect: pUseEffect, useRef: pUseRef, useState: pUseState } = React;

// Find clip that is "on" at a given time on V1 (the main cam)
function clipAt(clips, ms) {
  // Prefer V2 (B-roll) if it overlays
  const v2 = clips.find(c => c.trackId === "tr_v2" && ms >= c.posMs && ms < c.posMs + c.durMs);
  if (v2) return v2;
  return clips.find(c => c.trackId === "tr_v1" && ms >= c.posMs && ms < c.posMs + c.durMs);
}

function filterFromEffects(effects = []) {
  let brightness = 1, contrast = 1, saturation = 1, blur = 0;
  for (const fx of effects) {
    if (!fx.enabled) continue;
    if (fx.type === "brightness") brightness = 1 + fx.value;
    if (fx.type === "contrast")   contrast   = fx.value;
    if (fx.type === "saturation") saturation = fx.value;
    if (fx.type === "blur")       blur       = fx.value;
  }
  return `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) blur(${blur}px)`;
}

function MockFrame({ clip }) {
  // Render a stylized "screen recording" composition that matches the clip's vibe.
  if (!clip) return <div style={{ color: "rgba(255,255,255,0.3)" }}>—</div>;

  const kind = clip.name.split("_")[0];
  if (clip.name.startsWith("intro") || clip.name.startsWith("logo")) {
    return (
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", gap: 14, background: clip.thumbs?.[0] }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: "var(--accent)", display: "grid", placeItems: "center", color: "var(--accent-ink)" }}>
          {pIcon.Cloud(28)}
        </div>
        <div style={{ fontFamily: "Geist", fontSize: 22, fontWeight: 600, color: "white", letterSpacing: "-0.02em" }}>CloudCut</div>
        <div style={{ fontFamily: "Geist Mono", fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Q4 product launch</div>
      </div>
    );
  }
  if (clip.name.startsWith("feature_walk") || clip.name.startsWith("demo_result")) {
    // Fake screen-recording: window chrome + UI
    return (
      <div style={{ position: "absolute", inset: 0, padding: "5%", background: clip.thumbs?.[1] || "oklch(0.2 0.02 260)" }}>
        <div style={{ height: "100%", borderRadius: 6, background: "oklch(0.16 0.01 260)", overflow: "hidden", display: "grid", gridTemplateRows: "22px 1fr", boxShadow: "0 10px 40px -10px rgba(0,0,0,0.6)" }}>
          <div style={{ background: "oklch(0.22 0.01 260)", display: "flex", alignItems: "center", padding: "0 10px", gap: 5, borderBottom: "1px solid oklch(0.28 0.01 260)" }}>
            <div style={{ width: 7, height: 7, borderRadius: 50, background: "oklch(0.65 0.16 25)" }}/>
            <div style={{ width: 7, height: 7, borderRadius: 50, background: "oklch(0.78 0.15 75)" }}/>
            <div style={{ width: 7, height: 7, borderRadius: 50, background: "oklch(0.65 0.15 145)" }}/>
            <div style={{ flex: 1, height: 12, borderRadius: 3, background: "oklch(0.18 0.01 260)", margin: "0 16px", display: "flex", alignItems: "center", padding: "0 6px", fontSize: 8, fontFamily: "Geist Mono", color: "rgba(255,255,255,0.4)" }}>cloudcut.io/edit/q4-launch</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "32% 1fr", gap: 6, padding: 6 }}>
            <div style={{ background: "oklch(0.2 0.01 260)", borderRadius: 4, padding: 8 }}>
              {[0,1,2,3,4].map(i => (
                <div key={i} style={{ height: 8, marginBottom: 6, borderRadius: 2, background: i === 1 ? "var(--accent)" : "oklch(0.28 0.01 260)", width: `${60 + (i%3)*15}%`, opacity: i === 1 ? 1 : 0.7 }}/>
              ))}
            </div>
            <div style={{ background: "oklch(0.22 0.01 260)", borderRadius: 4, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: "20%", background: "linear-gradient(120deg, var(--accent), oklch(0.6 0.13 230))", opacity: 0.7, borderRadius: 4 }}/>
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "white", fontFamily: "Geist Mono", fontSize: 10 }}>{clip.name.startsWith("demo_result") ? "✓ exported" : "preview"}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (clip.name.startsWith("outro") || clip.name.startsWith("graphic")) {
    return (
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: clip.thumbs?.[0] || "oklch(0.3 0.06 280)", textAlign: "center" }}>
        <div>
          <div style={{ fontFamily: "Geist", fontSize: 20, fontWeight: 600, color: "white", marginBottom: 8, letterSpacing: "-0.02em" }}>Start editing in your browser</div>
          <div style={{ fontFamily: "Geist Mono", fontSize: 9, color: "rgba(255,255,255,0.6)", letterSpacing: "0.1em" }}>cloudcut.io</div>
        </div>
      </div>
    );
  }
  if (clip.name.startsWith("ui_closeup")) {
    return (
      <div style={{ position: "absolute", inset: 0, padding: "8%", background: clip.thumbs?.[0] }}>
        <div style={{ height: "100%", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ background: "oklch(0.22 0.02 240)", borderRadius: 4, padding: 8, display: "grid", placeContent: "center" }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, background: i === 1 ? "var(--accent)" : "oklch(0.35 0.05 240)", margin: "auto" }}/>
              <div style={{ fontFamily: "Geist Mono", fontSize: 6, color: "rgba(255,255,255,0.5)", marginTop: 4, textAlign: "center" }}>{["EXTRACT","RENDER","UPLOAD"][i]}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  // default — show clip's thumb
  return (
    <div style={{ position: "absolute", inset: 0, background: clip.thumbs?.[0] || "oklch(0.2 0.02 260)" }}/>
  );
}

function VideoPlayer() {
  const clips     = pUse(pStores.projectStore, s => s.clips);
  const fxIndex   = pUse(pStores.projectStore, s => s.effects);
  const currentMs = pUse(pStores.playbackStore, s => s.currentMs);
  const playing   = pUse(pStores.playbackStore, s => s.playing);
  const speed     = pUse(pStores.playbackStore, s => s.speed);
  const volume    = pUse(pStores.playbackStore, s => s.volume);
  const muted     = pUse(pStores.playbackStore, s => s.muted);
  const project   = pUse(pStores.projectStore, s => s.project);

  const clip = clipAt(clips, currentMs);
  const effects = clip ? (fxIndex[clip.id] || []) : [];
  const cssFilter = filterFromEffects(effects);

  // Playback ticker
  pUseEffect(() => {
    if (!playing) return;
    let raf, last = performance.now();
    const loop = (now) => {
      const dt = now - last;
      last = now;
      const cur = pStores.playbackStore.get();
      let next = cur.currentMs + dt * speed;
      if (next >= project.durationMs) { next = 0; pStores.playbackStore.set({ playing: false, currentMs: 0 }); return; }
      pStores.playbackStore.set({ currentMs: next });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, project.durationMs]);

  return (
    <div className="player-wrap">
      <div className="panel-head">
        <span className="title">Preview</span>
        <div className="tools" style={{ fontSize: 10, color: "var(--text-4)" }}>
          {clip && <span className="mono" style={{ color: "var(--text-3)" }}>{clip.name}</span>}
        </div>
      </div>
      <div className="player-canvas">
        <div className="player-stage" style={{ filter: cssFilter, transition: "filter 0.15s" }}>
          <MockFrame clip={clip} />
          <div className="player-safe" />
          <div className="player-overlay-tc">{pHelp.fmtTC(currentMs)}</div>
          <div className="player-overlay-res">{project.resolution} · {project.fps}fps</div>
        </div>
      </div>
      <div className="player-controls">
        <div className="tc-display">
          <span className="mono">{pHelp.fmtTC(currentMs)}</span>
          <span className="sep">/</span>
          <span className="mono total">{pHelp.fmtTC(project.durationMs)}</span>
        </div>

        <div className="transport">
          <button className="iconbtn" onClick={() => pActions.seek(0)} title="Go to start (Home)">{pIcon.SkipBack(13)}</button>
          <button className="iconbtn" onClick={() => pActions.seek(pStores.playbackStore.get().currentMs - 1000/30)} title="Step back (←)">{pIcon.StepBack(14)}</button>
          <button className={"iconbtn play " + (playing ? "playing" : "")} onClick={pActions.togglePlay} title="Play/Pause (Space)">
            {playing ? pIcon.Pause(14) : pIcon.Play(13)}
          </button>
          <button className="iconbtn" onClick={() => pActions.seek(pStores.playbackStore.get().currentMs + 1000/30)} title="Step forward (→)">{pIcon.StepFwd(14)}</button>
          <button className="iconbtn" onClick={() => pActions.seek(project.durationMs)} title="Go to end (End)">{pIcon.SkipFwd(13)}</button>
        </div>

        <div className="volume">
          <button className="iconbtn" onClick={pActions.toggleMute}>{muted ? pIcon.VolumeMute(14) : pIcon.Volume(14)}</button>
          <div className="volume-track">
            <div className="volume-fill" style={{ width: (muted ? 0 : volume * 100) + "%" }}/>
          </div>
        </div>

        <SpeedPicker speed={speed} />
      </div>
    </div>
  );
}

function SpeedPicker({ speed }) {
  const [open, setOpen] = pUseState(false);
  const speeds = [0.25, 0.5, 1, 1.5, 2];
  return (
    <div style={{ position: "relative" }}>
      <button className="speed-pill" onClick={() => setOpen(o => !o)}>{speed}× ▾</button>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "absolute", bottom: "100%", right: 0, marginBottom: 6, background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 6, padding: 4, zIndex: 20, minWidth: 60, boxShadow: "0 10px 30px -10px rgba(0,0,0,0.5)" }}>
          {speeds.map(s => (
            <div key={s}
              onClick={() => pActions.setSpeed(s)}
              style={{ padding: "5px 10px", borderRadius: 4, fontSize: 11, fontFamily: "Geist Mono", cursor: "pointer", background: s === speed ? "var(--accent-soft)" : "transparent", color: s === speed ? "var(--accent)" : "var(--text-1)" }}
            >
              {s}×
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

Object.assign(window.CC, { VideoPlayer });
