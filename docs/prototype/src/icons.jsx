/* global React */
// ============================================================
// CloudCut — Icons (lucide-ish, hand-crafted)
// All 16px, currentColor strokes
// ============================================================

const I = (paths, props = {}) => (size = 16) => (
  <svg
    width={size} height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {paths}
  </svg>
);

const Icon = {
  Play:     (s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M6 4 L20 12 L6 20 Z" /></svg>,
  Pause:    (s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>,
  SkipBack: I(<>
    <path d="M19 20 L9 12 L19 4 Z" fill="currentColor"/>
    <line x1="5" y1="4" x2="5" y2="20" />
  </>),
  SkipFwd:  I(<>
    <path d="M5 4 L15 12 L5 20 Z" fill="currentColor"/>
    <line x1="19" y1="4" x2="19" y2="20" />
  </>),
  StepBack: I(<polyline points="15 6 9 12 15 18" />),
  StepFwd:  I(<polyline points="9 6 15 12 9 18" />),
  Undo:     I(<><path d="M9 14 L4 9 L9 4" /><path d="M4 9 H14 a6 6 0 0 1 0 12 H10" /></>),
  Redo:     I(<><path d="M15 14 L20 9 L15 4" /><path d="M20 9 H10 a6 6 0 0 0 0 12 H14" /></>),
  Search:   I(<><circle cx="11" cy="11" r="6.5" /><path d="M20 20 L16 16" /></>),
  Plus:     I(<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>),
  Minus:    I(<line x1="5" y1="12" x2="19" y2="12"/>),
  Cursor:   I(<path d="M5 3 L19 12 L13 14 L11 21 Z" fill="currentColor" />),
  Blade:    I(<><circle cx="6" cy="18" r="3" /><line x1="8" y1="16" x2="19" y2="5" /><path d="M19 5 L20 4" /></>),
  Hand:     I(<><path d="M9 11 V5 a1.5 1.5 0 0 1 3 0 V11" /><path d="M12 5 a1.5 1.5 0 0 1 3 0 V11" /><path d="M15 7 a1.5 1.5 0 0 1 3 0 V13" /><path d="M18 9 a1.5 1.5 0 0 1 3 0 V16 a7 7 0 0 1 -7 7 H11 a5 5 0 0 1 -5 -5 V12" /></>),
  Snap:     I(<><line x1="4" y1="12" x2="20" y2="12" /><line x1="12" y1="4" x2="12" y2="20" /><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" /></>),
  Magnet:   I(<><path d="M6 4 V12 a6 6 0 0 0 12 0 V4" /><line x1="6" y1="4" x2="10" y2="4" /><line x1="14" y1="4" x2="18" y2="4" /></>),
  Lock:     I(<><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11 V8 a4 4 0 0 1 8 0 V11" /></>),
  Unlock:   I(<><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11 V8 a4 4 0 0 1 7.5 -2" /></>),
  Eye:      I(<><path d="M2 12 s4 -7 10 -7 s10 7 10 7 s-4 7 -10 7 s-10 -7 -10 -7 Z" /><circle cx="12" cy="12" r="3"/></>),
  EyeOff:   I(<><path d="M3 3 L21 21" /><path d="M10.5 6.4 A11 11 0 0 1 12 5 c6 0 10 7 10 7 a17 17 0 0 1 -3.4 4.1" /><path d="M6.5 8.4 A17 17 0 0 0 2 12 s4 7 10 7 a10 10 0 0 0 4 -0.8" /></>),
  Volume:   I(<><path d="M5 9 H8 L13 5 V19 L8 15 H5 Z" /><path d="M16 9 a4 4 0 0 1 0 6" /></>),
  VolumeMute: I(<><path d="M5 9 H8 L13 5 V19 L8 15 H5 Z" /><line x1="17" y1="9" x2="22" y2="14" /><line x1="22" y1="9" x2="17" y2="14" /></>),
  Upload:   I(<><path d="M12 3 V15" /><path d="M7 8 L12 3 L17 8" /><path d="M4 17 V19 a2 2 0 0 0 2 2 H18 a2 2 0 0 0 2 -2 V17" /></>),
  Download: I(<><path d="M12 3 V15" /><path d="M7 10 L12 15 L17 10" /><path d="M4 17 V19 a2 2 0 0 0 2 2 H18 a2 2 0 0 0 2 -2 V17" /></>),
  Share:    I(<><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" /></>),
  Settings: I(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15 a1.65 1.65 0 0 0 0.3 1.8 l0.06 0.06 a2 2 0 0 1 -2.83 2.83 l-0.06 -0.06 a1.65 1.65 0 0 0 -1.8 -0.3 a1.65 1.65 0 0 0 -1 1.5 V21 a2 2 0 0 1 -4 0 v-0.1 a1.65 1.65 0 0 0 -1 -1.5 a1.65 1.65 0 0 0 -1.8 0.3 l-0.06 0.06 a2 2 0 0 1 -2.83 -2.83 l0.06 -0.06 a1.65 1.65 0 0 0 0.3 -1.8 a1.65 1.65 0 0 0 -1.5 -1 H3 a2 2 0 0 1 0 -4 h0.1 a1.65 1.65 0 0 0 1.5 -1 a1.65 1.65 0 0 0 -0.3 -1.8 l-0.06 -0.06 a2 2 0 0 1 2.83 -2.83 l0.06 0.06 a1.65 1.65 0 0 0 1.8 0.3 H9 a1.65 1.65 0 0 0 1 -1.5 V3 a2 2 0 0 1 4 0 v0.1 a1.65 1.65 0 0 0 1 1.5 a1.65 1.65 0 0 0 1.8 -0.3 l0.06 -0.06 a2 2 0 0 1 2.83 2.83 l-0.06 0.06 a1.65 1.65 0 0 0 -0.3 1.8 V9 a1.65 1.65 0 0 0 1.5 1 H21 a2 2 0 0 1 0 4 h-0.1 a1.65 1.65 0 0 0 -1.5 1 z" /></>),
  X:        I(<><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></>),
  Check:    I(<polyline points="4 12 10 18 20 6"/>),
  ChevronD: I(<polyline points="6 9 12 15 18 9"/>),
  ChevronR: I(<polyline points="9 6 15 12 9 18"/>),
  Film:     I(<><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="8" y1="4" x2="8" y2="20"/><line x1="16" y1="4" x2="16" y2="20"/><line x1="3" y1="12" x2="21" y2="12"/></>),
  Music:    I(<><path d="M9 18 V6 L20 4 V16" /><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></>),
  Image:    I(<><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><polyline points="3 18 9 13 13 17 17 14 21 18"/></>),
  Layers:   I(<><polygon points="12 3 21 8 12 13 3 8 12 3" /><polyline points="3 13 12 18 21 13" /><polyline points="3 18 12 23 21 18" /></>),
  Wand:     I(<><line x1="4" y1="20" x2="16" y2="8" /><polygon points="16 8 19 5 22 8 19 11" fill="currentColor" stroke="none"/><line x1="3" y1="6" x2="6" y2="6"/><line x1="4.5" y1="4.5" x2="4.5" y2="7.5"/></>),
  History:  I(<><polyline points="3 4 3 10 9 10"/><path d="M3 10 A9 9 0 1 1 7 19" /><polyline points="12 7 12 12 16 14"/></>),
  Keyboard: I(<><rect x="2" y="6" width="20" height="13" rx="2"/><line x1="6" y1="10" x2="6" y2="10.01"/><line x1="10" y1="10" x2="10" y2="10.01"/><line x1="14" y1="10" x2="14" y2="10.01"/><line x1="18" y1="10" x2="18" y2="10.01"/><line x1="6" y1="14" x2="6" y2="14.01"/><line x1="18" y1="14" x2="18" y2="14.01"/><line x1="9" y1="14" x2="15" y2="14"/></>),
  Help:     I(<><circle cx="12" cy="12" r="9"/><path d="M9.5 9 a2.5 2.5 0 1 1 4.5 1.5 c-0.5 1 -2 1 -2 2.5 V14"/><line x1="12" y1="17" x2="12" y2="17.01"/></>),
  Trash:    I(<><polyline points="4 7 20 7"/><path d="M9 7 V5 a2 2 0 0 1 2 -2 h2 a2 2 0 0 1 2 2 V7" /><path d="M6 7 L7 20 a1 1 0 0 0 1 1 H16 a1 1 0 0 0 1 -1 L18 7" /></>),
  Drag:     I(<><circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none"/></>),
  Sun:      I(<><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="5" y1="5" x2="7" y2="7"/><line x1="17" y1="17" x2="19" y2="19"/><line x1="5" y1="19" x2="7" y2="17"/><line x1="17" y1="7" x2="19" y2="5"/></>),
  Moon:     I(<path d="M20 14 a8 8 0 1 1 -10 -10 a7 7 0 0 0 10 10 z"/>),
  Cloud:    I(<path d="M6 18 a4 4 0 0 1 -1 -7.8 a5 5 0 0 1 9.5 -2 a4 4 0 0 1 4.5 6.8 H6 z"/>),
  Scissors: I(<><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="8.5" y1="8" x2="20" y2="20"/><line x1="20" y1="4" x2="8.5" y2="16"/></>),
  Sliders:  I(<><line x1="4" y1="6" x2="14" y2="6"/><line x1="18" y1="6" x2="20" y2="6"/><circle cx="16" cy="6" r="2"/><line x1="4" y1="12" x2="6" y2="12"/><line x1="10" y1="12" x2="20" y2="12"/><circle cx="8" cy="12" r="2"/><line x1="4" y1="18" x2="14" y2="18"/><line x1="18" y1="18" x2="20" y2="18"/><circle cx="16" cy="18" r="2"/></>),
  Sparkle:  I(<><path d="M12 3 L13.5 9.5 L20 11 L13.5 12.5 L12 19 L10.5 12.5 L4 11 L10.5 9.5 Z" fill="currentColor" stroke="none"/></>),
  Circle:   I(<circle cx="12" cy="12" r="9" />),
};

window.CC.Icon = Icon;
