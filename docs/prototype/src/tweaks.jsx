/* global React */
// ============================================================
// Tweaks panel — wraps the prototype's tweakable surface
// ============================================================
const { TweaksPanel, useTweaks, TweakSection, TweakRadio, TweakSelect, TweakSlider, TweakToggle, TweakColor } = window;
const { useEffect: twFx } = React;

const ACCENT_OPTIONS = [
  "oklch(0.82 0.16 165)",   // mint
  "oklch(0.80 0.14 220)",   // cyan
  "oklch(0.74 0.18 295)",   // violet
  "oklch(0.82 0.16 70)",    // amber
  "oklch(0.74 0.18 25)",    // coral
];

function CCTweaks() {
  const [t, setTweak] = useTweaks(window.CC_TWEAK_DEFAULTS);

  // Apply tweaks on mount + on change
  twFx(() => {
    window.CC.actions.applyTweaks(t);
  }, [t.theme, t.accent, t.snap, t.zoom, t.clipStyle, t.presence, t.trackPreset, t.shortcuts]);

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Appearance">
        <TweakRadio
          label="Theme"
          value={t.theme}
          onChange={v => setTweak("theme", v)}
          options={[
            { value: "dark",  label: "Dark" },
            { value: "light", label: "Light" },
          ]}
        />
        <TweakColor
          label="Accent"
          value={t.accent}
          onChange={v => setTweak("accent", v)}
          options={ACCENT_OPTIONS}
        />
      </TweakSection>

      <TweakSection label="Timeline">
        <TweakSelect
          label="Clip rendering"
          value={t.clipStyle}
          onChange={v => setTweak("clipStyle", v)}
          options={[
            { value: "rich",  label: "Rich (thumbs + waves)" },
            { value: "thumb", label: "Thumbnail strip only" },
            { value: "wave",  label: "Waveform only" },
            { value: "flat",  label: "Flat colored blocks" },
          ]}
        />
        <TweakSlider
          label="Zoom"
          min={0.3} max={4} step={0.1}
          value={t.zoom}
          unit="×"
          onChange={v => setTweak("zoom", v)}
        />
        <TweakToggle
          label="Snap"
          value={t.snap}
          onChange={v => setTweak("snap", v)}
        />
        <TweakSelect
          label="Track preset"
          value={t.trackPreset}
          onChange={v => setTweak("trackPreset", v)}
          options={[
            { value: "demo",        label: "Demo · V1 V2 A1 A2" },
            { value: "minimal",     label: "Minimal · V1 A1" },
            { value: "audio-heavy", label: "Audio heavy · V1 A1 A2" },
          ]}
        />
      </TweakSection>

      <TweakSection label="Collaboration">
        <TweakToggle
          label="Presence"
          value={t.presence}
          onChange={v => setTweak("presence", v)}
        />
      </TweakSection>

      <TweakSection label="Overlays">
        <TweakToggle
          label="Shortcuts"
          value={t.shortcuts}
          onChange={v => setTweak("shortcuts", v)}
        />
      </TweakSection>
    </TweaksPanel>
  );
}

window.CC.CCTweaks = CCTweaks;
