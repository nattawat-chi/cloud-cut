/* global React */
// ============================================================
// Inspector — right panel
// ============================================================
const { stores: iStores, actions: iActions, useStore: iUse, helpers: iHelp } = window.CC;
const { Icon: iIcon } = window.CC;

const FX_TYPES = {
  brightness: { label: "Brightness", min: -0.5, max: 0.5, step: 0.01, fmt: v => v.toFixed(2) },
  contrast:   { label: "Contrast",   min: 0.5,  max: 2.0, step: 0.01, fmt: v => v.toFixed(2) },
  saturation: { label: "Saturation", min: 0.0,  max: 2.0, step: 0.01, fmt: v => v.toFixed(2) },
  blur:       { label: "Blur",       min: 0,    max: 20,  step: 0.5,  fmt: v => v.toFixed(1) + "px" },
};

function EffectCard({ clipId, fx }) {
  const meta = FX_TYPES[fx.type] || FX_TYPES.brightness;
  return (
    <div className={"eff-card" + (fx.enabled ? "" : " disabled")}>
      <div className="eff-card-head">
        <div className="eff-card-title">
          <div className={"eff-toggle " + (fx.enabled ? "on" : "")} onClick={() => iActions.toggleEffect(clipId, fx.id)}/>
          {meta.label}
        </div>
        <div className="eff-card-tools">
          <button className="iconbtn" onClick={() => iActions.removeEffect(clipId, fx.id)} title="Remove">{iIcon.Trash(11)}</button>
        </div>
      </div>
      <div className="insp-slider-row" style={{ gridTemplateColumns: "1fr 46px" }}>
        <input
          type="range"
          className="insp-slider"
          min={meta.min} max={meta.max} step={meta.step}
          value={fx.value}
          onChange={e => iActions.updateEffect(clipId, fx.id, parseFloat(e.target.value))}
          disabled={!fx.enabled}
        />
        <div className="insp-num mono">{meta.fmt(fx.value)}</div>
      </div>
    </div>
  );
}

function PropsTab({ clip, asset }) {
  return (
    <div className="insp-body">
      <div className="insp-section">
        <div className="insp-section-head">
          <span className="insp-section-title">Clip</span>
        </div>
        <div className="insp-row">
          <label>Name</label>
          <input className="insp-input" defaultValue={clip.name}/>
        </div>
        <div className="insp-row">
          <label>Source</label>
          <div style={{ fontSize: 11, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 6 }}>
            {iIcon.Film(11)} <span className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asset?.name || "—"}</span>
          </div>
        </div>
        <div className="insp-row">
          <label>Track</label>
          <div style={{ fontSize: 11, color: "var(--text-2)", fontFamily: "Geist Mono" }}>{clip.trackId.replace("tr_","").toUpperCase()}</div>
        </div>
        <div className="insp-row">
          <label>Position</label>
          <input className="insp-input mono" defaultValue={(clip.posMs/1000).toFixed(2) + "s"}/>
        </div>
        <div className="insp-row">
          <label>Duration</label>
          <input className="insp-input mono" defaultValue={(clip.durMs/1000).toFixed(2) + "s"}/>
        </div>
        <div className="insp-row">
          <label>In</label>
          <input className="insp-input mono" defaultValue="00:00:00:00"/>
        </div>
        <div className="insp-row">
          <label>Out</label>
          <input className="insp-input mono" defaultValue={iHelp.fmtTC(clip.durMs)}/>
        </div>
      </div>

      <div className="insp-section">
        <div className="insp-section-head">
          <span className="insp-section-title">Transform</span>
          <button className="iconbtn" title="Reset" style={{ fontSize: 10, padding: "0 6px", height: 20 }}>Reset</button>
        </div>
        <SliderRow label="X" min={-1000} max={1000} step={1} init={0} unit="px"/>
        <SliderRow label="Y" min={-1000} max={1000} step={1} init={0} unit="px"/>
        <SliderRow label="Scale" min={0.1} max={3} step={0.01} init={1} unit="×"/>
        <SliderRow label="Rotation" min={-180} max={180} step={1} init={0} unit="°"/>
        <SliderRow label="Opacity" min={0} max={1} step={0.01} init={1} unit=""/>
      </div>
    </div>
  );
}

function SliderRow({ label, min, max, step, init, unit }) {
  const [v, setV] = React.useState(init);
  const fmt = (n) => (Number.isInteger(step) ? n.toFixed(0) : n.toFixed(2)) + unit;
  return (
    <div className="insp-slider-row">
      <label>{label}</label>
      <input type="range" className="insp-slider" min={min} max={max} step={step} value={v} onChange={e => setV(parseFloat(e.target.value))}/>
      <div className="insp-num mono">{fmt(v)}</div>
    </div>
  );
}

function EffectsTab({ clip }) {
  const fxIndex = iUse(iStores.projectStore, s => s.effects);
  const list = fxIndex[clip.id] || [];
  const hasType = (t) => list.some(fx => fx.type === t);

  return (
    <div className="insp-body">
      <div className="insp-section">
        <div className="insp-section-head">
          <span className="insp-section-title">Effects · {list.length}</span>
          <button
            className="iconbtn"
            onClick={() => iActions.toggleEffectsBrowser()}
            title="Browse effects"
            style={{ fontSize: 10, padding: "0 6px", height: 20 }}
          >
            Browse
          </button>
        </div>
        {list.map(fx => <EffectCard key={fx.id} clipId={clip.id} fx={fx} />)}
        <div style={{ marginTop: 8 }}>
          <details>
            <summary style={{ listStyle: "none", cursor: "pointer" }}>
              <button className="add-effect-btn" onClick={e => { e.preventDefault(); e.currentTarget.parentElement.parentElement.toggleAttribute("open"); }}>
                {iIcon.Plus(12)} Add Effect
              </button>
            </summary>
            <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
              {Object.entries(FX_TYPES).map(([k, m]) => (
                <button
                  key={k}
                  className="iconbtn"
                  style={{ justifyContent: "flex-start", width: "100%", height: 26, padding: "0 8px", background: "var(--bg-2)", border: "1px solid var(--line)" }}
                  onClick={() => iActions.addEffect(clip.id, k)}
                  disabled={hasType(k)}
                >
                  {iIcon.Sparkle(11)} <span style={{ fontSize: 11 }}>{m.label}</span>
                  {hasType(k) && <span style={{ marginLeft: "auto", color: "var(--text-4)", fontSize: 10 }}>added</span>}
                </button>
              ))}
            </div>
          </details>
        </div>
      </div>

      <div className="insp-section">
        <div className="insp-section-head">
          <span className="insp-section-title">CSS Preview</span>
        </div>
        <div style={{ background: "var(--bg-2)", border: "1px solid var(--line)", padding: 10, borderRadius: 6, fontFamily: "Geist Mono", fontSize: 10.5, color: "var(--text-2)", lineHeight: 1.55 }}>
          <div><span style={{ color: "var(--text-4)" }}>filter:</span></div>
          {list.filter(fx => fx.enabled).map(fx => (
            <div key={fx.id} style={{ paddingLeft: 14 }}>
              <span style={{ color: "var(--accent)" }}>
                {fx.type === "brightness" && `brightness(${(1 + fx.value).toFixed(2)})`}
                {fx.type === "contrast" && `contrast(${fx.value.toFixed(2)})`}
                {fx.type === "saturation" && `saturate(${fx.value.toFixed(2)})`}
                {fx.type === "blur" && `blur(${fx.value.toFixed(1)}px)`}
              </span>
            </div>
          ))}
          {list.filter(fx => fx.enabled).length === 0 && <div style={{ paddingLeft: 14, color: "var(--text-4)" }}>none</div>}
        </div>
      </div>
    </div>
  );
}

function InspectorPanel() {
  const selected = iUse(iStores.uiStore, s => s.selectedClipIds);
  const tab      = iUse(iStores.uiStore, s => s.inspectorTab);
  const clips    = iUse(iStores.projectStore, s => s.clips);
  const setTab   = (t) => iStores.uiStore.set({ inspectorTab: t });

  if (selected.length === 0) {
    return (
      <div className="inspector">
        <div className="panel-head"><span className="title">Inspector</span></div>
        <div className="empty-inspector">
          <div className="empty-icon">{iIcon.Cursor(20)}</div>
          <div>Select a clip on the timeline<br/>to edit properties &amp; effects.</div>
        </div>
      </div>
    );
  }

  if (selected.length > 1) {
    return (
      <div className="inspector">
        <div className="panel-head"><span className="title">Inspector</span></div>
        <div className="empty-inspector">
          <div className="empty-icon">{iIcon.Layers(20)}</div>
          <div><strong style={{ color: "var(--text-2)" }}>{selected.length} clips</strong> selected<br/><span style={{ fontSize: 11 }}>Choose one to edit</span></div>
        </div>
      </div>
    );
  }

  const clip = clips.find(c => c.id === selected[0]);
  if (!clip) return <div className="inspector"><div className="panel-head"><span className="title">Inspector</span></div></div>;

  const asset = window.CC.ASSET_INDEX[clip.assetId];

  return (
    <div className="inspector">
      <div className="panel-head">
        <span className="title">Inspector</span>
      </div>
      <div className="insp-tabs">
        <button className={"insp-tab " + (tab === "props" ? "active" : "")} onClick={() => setTab("props")}>Properties</button>
        <button className={"insp-tab " + (tab === "effects" ? "active" : "")} onClick={() => setTab("effects")}>Effects</button>
        <button className="insp-tab" disabled>Audio</button>
      </div>
      {tab === "props"   && <PropsTab clip={clip} asset={asset}/>}
      {tab === "effects" && <EffectsTab clip={clip}/>}
    </div>
  );
}

Object.assign(window.CC, { InspectorPanel });
