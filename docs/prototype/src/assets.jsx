/* global React */
// ============================================================
// Asset Browser — left panel
// ============================================================
const { stores: aStores, actions: aActions, useStore: aUse, helpers: aHelpers } = window.CC;
const { Icon: aIcon } = window.CC;

function AssetThumb({ asset }) {
  if (asset.type === "audio") {
    return (
      <div className="asset-thumb audio">
        {aIcon.Music(16)}
        {asset.durMs && <div className="asset-thumb-dur">{aHelpers.fmtClipDur(asset.durMs)}</div>}
      </div>
    );
  }
  if (asset.type === "image") {
    return (
      <div className="asset-thumb" style={{ background: asset.thumb }}>
        {aIcon.Image(14)}
      </div>
    );
  }
  return (
    <div className="asset-thumb" style={{ background: asset.thumb || "var(--bg-3)" }}>
      {asset.durMs && <div className="asset-thumb-dur">{aHelpers.fmtClipDur(asset.durMs)}</div>}
    </div>
  );
}

function AssetStatus({ asset }) {
  if (asset.status === "ready") return <span className="asset-status ready">{aIcon.Check(9)}ready</span>;
  if (asset.status === "processing") return <span className="asset-status processing"><span className="spinner"/>processing {asset.progress}%</span>;
  if (asset.status === "uploading") return <span className="asset-status uploading"><span className="spinner"/>uploading {asset.progress}%</span>;
  return <span className="asset-status">{asset.status}</span>;
}

function AssetRow({ asset }) {
  return (
    <div className="asset-row" draggable>
      <AssetThumb asset={asset} />
      <div className="asset-meta">
        <div className="asset-name">{asset.name}</div>
        <div className="asset-sub">
          <span>{asset.size}</span>
          {asset.durMs && <><span style={{ color: "var(--text-4)" }}>·</span><span className="mono">{aHelpers.fmtClipDur(asset.durMs)}</span></>}
        </div>
        {asset.status !== "ready" && (
          <div className="asset-progress"><div style={{ width: asset.progress + "%" }}/></div>
        )}
      </div>
      <AssetStatus asset={asset} />
    </div>
  );
}

function AssetBrowser() {
  const tab = aUse(aStores.uiStore, s => s.selectedAssetTab);
  const setTab = (t) => aStores.uiStore.set({ selectedAssetTab: t });

  const all = window.CC.ASSETS;
  const counts = {
    all: all.length,
    video: all.filter(a => a.type === "video").length,
    audio: all.filter(a => a.type === "audio").length,
    image: all.filter(a => a.type === "image").length,
  };
  const visible = tab === "all" ? all : all.filter(a => a.type === tab);

  const inProgress = visible.filter(a => a.status !== "ready");
  const ready = visible.filter(a => a.status === "ready");

  return (
    <div className="assets">
      <div className="panel-head">
        <span className="title">Assets</span>
        <div className="tools">
          <button className="iconbtn" title="Filter">{aIcon.Sliders(12)}</button>
        </div>
      </div>

      <div className="asset-tabs">
        {["all","video","audio","image"].map(k => (
          <button key={k} className={"asset-tab " + (tab === k ? "active" : "")} onClick={() => setTab(k)}>
            {k === "video" && aIcon.Film(12)}
            {k === "audio" && aIcon.Music(12)}
            {k === "image" && aIcon.Image(12)}
            <span style={{ textTransform: "capitalize" }}>{k}</span>
            <span className="count">{counts[k]}</span>
          </button>
        ))}
      </div>

      <div className="asset-search">
        <div className="searchwrap">
          {aIcon.Search(14)}
          <input placeholder="Search assets…" defaultValue="" />
        </div>
        <button className="upload-btn" title="Upload">{aIcon.Upload(14)}</button>
      </div>

      <div className="asset-list">
        {inProgress.length > 0 && <>
          <div className="asset-section-title">In progress · {inProgress.length}</div>
          {inProgress.map(a => <AssetRow key={a.id} asset={a} />)}
        </>}
        {ready.length > 0 && <>
          <div className="asset-section-title">Ready · {ready.length}</div>
          {ready.map(a => <AssetRow key={a.id} asset={a} />)}
        </>}
      </div>
    </div>
  );
}

Object.assign(window.CC, { AssetBrowser });
