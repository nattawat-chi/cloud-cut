/* global React */
// ============================================================
// CloudCut — Mock data
// Q4 Product Demo project: screen-rec + B-roll + VO + music
// ============================================================

const PROJECT = {
  id: "proj_01HX",
  name: "Q4 Product Demo — CloudCut Launch",
  workspace: "Cobalt Studio",
  fps: 30,
  resolution: "1920×1080",
  durationMs: 42000,
};

// Pre-built thumbnail palette per clip (CSS gradients standing in for real frames)
const THUMB_GRADIENTS = {
  intro: [
    "linear-gradient(120deg, oklch(0.32 0.05 240), oklch(0.45 0.08 270))",
    "linear-gradient(120deg, oklch(0.4 0.06 250), oklch(0.55 0.1 280))",
    "linear-gradient(120deg, oklch(0.5 0.08 260), oklch(0.65 0.12 290))",
    "linear-gradient(120deg, oklch(0.55 0.1 270), oklch(0.7 0.14 300))",
  ],
  walkthrough: [
    "linear-gradient(120deg, oklch(0.22 0.02 260), oklch(0.32 0.03 270))",
    "linear-gradient(120deg, oklch(0.28 0.03 240), oklch(0.38 0.04 260))",
    "linear-gradient(120deg, oklch(0.32 0.04 220), oklch(0.42 0.05 250))",
    "linear-gradient(120deg, oklch(0.30 0.04 210), oklch(0.40 0.06 240))",
    "linear-gradient(120deg, oklch(0.34 0.05 200), oklch(0.44 0.07 230))",
    "linear-gradient(120deg, oklch(0.30 0.04 220), oklch(0.40 0.05 250))",
  ],
  result: [
    "linear-gradient(120deg, oklch(0.5 0.13 165), oklch(0.6 0.14 180))",
    "linear-gradient(120deg, oklch(0.55 0.14 160), oklch(0.65 0.15 175))",
    "linear-gradient(120deg, oklch(0.5 0.12 170), oklch(0.6 0.13 185))",
  ],
  outro: [
    "linear-gradient(120deg, oklch(0.35 0.06 280), oklch(0.50 0.10 320))",
    "linear-gradient(120deg, oklch(0.40 0.08 290), oklch(0.55 0.12 330))",
    "linear-gradient(120deg, oklch(0.30 0.05 270), oklch(0.45 0.08 310))",
  ],
  logo: [
    "linear-gradient(120deg, oklch(0.18 0.01 260), oklch(0.25 0.02 270))",
    "linear-gradient(120deg, oklch(0.20 0.02 260), oklch(0.28 0.03 270))",
  ],
  ui: [
    "linear-gradient(120deg, oklch(0.42 0.04 230), oklch(0.52 0.06 250))",
    "linear-gradient(120deg, oklch(0.45 0.05 235), oklch(0.55 0.07 255))",
  ],
  graphic: [
    "linear-gradient(120deg, oklch(0.6 0.16 30), oklch(0.7 0.18 50))",
    "linear-gradient(120deg, oklch(0.65 0.17 40), oklch(0.75 0.19 60))",
  ],
};

const TRACKS = [
  { id: "tr_v1", type: "video", label: "V1 · Main Cam",  tag: "V1", colorVar: "--clip-v-1", muted: false, locked: false, visible: true },
  { id: "tr_v2", type: "video", label: "V2 · B-Roll",    tag: "V2", colorVar: "--clip-v-2", muted: false, locked: false, visible: true },
  { id: "tr_a1", type: "audio", label: "A1 · Voiceover", tag: "A1", colorVar: "--clip-a-1", muted: false, locked: false, visible: true },
  { id: "tr_a2", type: "audio", label: "A2 · Music",     tag: "A2", colorVar: "--clip-a-2", muted: false, locked: true,  visible: true },
];

const CLIPS = [
  // V1 Main cam — screen recording
  { id: "c1", trackId: "tr_v1", assetId: "a_intro",       name: "intro_screen.mp4",       posMs:    0, durMs:  6000, thumbs: THUMB_GRADIENTS.intro, fx: ["brightness"] },
  { id: "c2", trackId: "tr_v1", assetId: "a_walk",        name: "feature_walkthrough.mp4", posMs: 6000, durMs: 14000, thumbs: THUMB_GRADIENTS.walkthrough, fx: ["contrast","saturation"] },
  { id: "c3", trackId: "tr_v1", assetId: "a_result",      name: "demo_result.mp4",        posMs: 20000, durMs:  7000, thumbs: THUMB_GRADIENTS.result, fx: [] },
  { id: "c4", trackId: "tr_v1", assetId: "a_outro",       name: "outro_screen.mp4",       posMs: 27000, durMs:  7000, thumbs: THUMB_GRADIENTS.outro, fx: ["brightness","blur"] },

  // V2 B-Roll
  { id: "c5", trackId: "tr_v2", assetId: "a_logo",        name: "logo_animation.mp4",     posMs:    0, durMs:  3000, thumbs: THUMB_GRADIENTS.logo, fx: [] },
  { id: "c6", trackId: "tr_v2", assetId: "a_ui_close",    name: "ui_closeup.mp4",         posMs: 11500, durMs:  4500, thumbs: THUMB_GRADIENTS.ui, fx: ["saturation"] },
  { id: "c7", trackId: "tr_v2", assetId: "a_graphic",     name: "outro_graphic.mp4",      posMs: 30500, durMs:  3500, thumbs: THUMB_GRADIENTS.graphic, fx: [] },

  // A1 VO
  { id: "c8", trackId: "tr_a1", assetId: "a_vo_intro",    name: "vo_intro.wav",           posMs:    300, durMs:  5500, fx: [] },
  { id: "c9", trackId: "tr_a1", assetId: "a_vo_walk",     name: "vo_features.wav",        posMs:  6000, durMs: 13800, fx: [] },
  { id: "c10",trackId: "tr_a1", assetId: "a_vo_result",   name: "vo_payoff.wav",          posMs: 20000, durMs:  6500, fx: [] },
  { id: "c11",trackId: "tr_a1", assetId: "a_vo_outro",    name: "vo_cta.wav",             posMs: 27000, durMs:  6800, fx: [] },

  // A2 Music — single bed
  { id: "c12",trackId: "tr_a2", assetId: "a_music",       name: "ambient_bed.mp3",        posMs:    0, durMs: 34000, fx: ["fade-in","fade-out"] },
];

const ASSETS = [
  { id: "a_intro",     type: "video", name: "intro_screen.mp4",        durMs:  6000, size: "184 MB", status: "ready",      progress: 100, thumb: THUMB_GRADIENTS.intro[0] },
  { id: "a_walk",      type: "video", name: "feature_walkthrough.mp4", durMs: 14000, size: "1.2 GB", status: "ready",      progress: 100, thumb: THUMB_GRADIENTS.walkthrough[2] },
  { id: "a_result",    type: "video", name: "demo_result.mp4",         durMs:  7000, size: "298 MB", status: "ready",      progress: 100, thumb: THUMB_GRADIENTS.result[1] },
  { id: "a_outro",     type: "video", name: "outro_screen.mp4",        durMs:  7000, size: "212 MB", status: "ready",      progress: 100, thumb: THUMB_GRADIENTS.outro[0] },
  { id: "a_logo",      type: "video", name: "logo_animation.mp4",      durMs:  3000, size:  "48 MB", status: "ready",      progress: 100, thumb: THUMB_GRADIENTS.logo[0] },
  { id: "a_ui_close",  type: "video", name: "ui_closeup.mp4",          durMs:  4500, size: "112 MB", status: "ready",      progress: 100, thumb: THUMB_GRADIENTS.ui[0] },
  { id: "a_graphic",   type: "video", name: "outro_graphic.mp4",       durMs:  3500, size:  "76 MB", status: "ready",      progress: 100, thumb: THUMB_GRADIENTS.graphic[0] },
  { id: "a_broll_01",  type: "video", name: "office_broll_wide.mp4",   durMs: 12000, size: "412 MB", status: "processing", progress:  62, thumb: "linear-gradient(120deg, oklch(0.4 0.05 90), oklch(0.5 0.07 110))" },
  { id: "a_dashboard", type: "video", name: "dashboard_recording.mp4", durMs: 18500, size: "1.5 GB", status: "uploading",  progress:  34, thumb: "linear-gradient(120deg, oklch(0.3 0.04 260), oklch(0.4 0.06 280))" },

  { id: "a_vo_intro",  type: "audio", name: "vo_intro.wav",            durMs:  5500, size:  "32 MB", status: "ready", progress: 100 },
  { id: "a_vo_walk",   type: "audio", name: "vo_features.wav",         durMs: 13800, size:  "78 MB", status: "ready", progress: 100 },
  { id: "a_vo_result", type: "audio", name: "vo_payoff.wav",           durMs:  6500, size:  "38 MB", status: "ready", progress: 100 },
  { id: "a_vo_outro",  type: "audio", name: "vo_cta.wav",              durMs:  6800, size:  "40 MB", status: "ready", progress: 100 },
  { id: "a_music",     type: "audio", name: "ambient_bed.mp3",         durMs: 34000, size:  "12 MB", status: "ready", progress: 100 },

  { id: "a_thumb_01",  type: "image", name: "title_card.png",          durMs: null,  size:  "2.1 MB", status: "ready", progress: 100, thumb: "linear-gradient(120deg, oklch(0.5 0.1 30), oklch(0.6 0.12 50))" },
  { id: "a_thumb_02",  type: "image", name: "lower_third.png",         durMs: null,  size:  "0.8 MB", status: "ready", progress: 100, thumb: "linear-gradient(120deg, oklch(0.4 0.08 200), oklch(0.5 0.1 220))" },
];

const ASSET_INDEX = Object.fromEntries(ASSETS.map(a => [a.id, a]));

const COLLABORATORS = [
  { id: "u_alice", name: "Alice K.",   initials: "AK", color: "var(--collab-1)" },
  { id: "u_mira",  name: "Mira S.",    initials: "MS", color: "var(--collab-2)" },
  { id: "u_dev",   name: "Devon R.",   initials: "DR", color: "var(--collab-3)" },
];

const YOU = { id: "u_you", name: "You", initials: "YU" };

const INITIAL_HISTORY = [
  { id: "h1", type: "clip.add",    desc: "Added vo_intro.wav to A1",     ts: "11:42:08", who: "You" },
  { id: "h2", type: "clip.move",   desc: "Moved demo_result.mp4 to 20s", ts: "11:43:15", who: "You" },
  { id: "h3", type: "effect.add",  desc: "Added Saturation to ui_closeup", ts: "11:44:02", who: "Alice K." },
  { id: "h4", type: "clip.trim",   desc: "Trimmed outro_screen.mp4 by 1.4s", ts: "11:45:21", who: "You" },
  { id: "h5", type: "effect.update", desc: "Brightness 0.05 → 0.08 on outro", ts: "11:46:33", who: "You" },
  { id: "h6", type: "clip.split",  desc: "Split feature_walkthrough at 11s", ts: "11:47:48", who: "Mira S." },
];

window.CC = window.CC || {};
Object.assign(window.CC, {
  PROJECT, TRACKS, CLIPS, ASSETS, ASSET_INDEX, COLLABORATORS, YOU,
  INITIAL_HISTORY, THUMB_GRADIENTS,
});
