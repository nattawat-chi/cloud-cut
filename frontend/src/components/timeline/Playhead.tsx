import { msToPx } from "@/utils/geometry";

interface PlayheadProps {
  currentTimeMs: number;
  zoomLevel: number;
}

/**
 * Vertical accent line spanning the full timeline content height + a
 * downward-pointing triangle handle at the top. Lives inside `.tl-inner`
 * so horizontal scrolling moves it with the rows naturally.
 */
export function Playhead({ currentTimeMs, zoomLevel }: PlayheadProps) {
  const left = msToPx(currentTimeMs, zoomLevel);
  return (
    <div
      className="pointer-events-none absolute top-0 bottom-0 z-6"
      style={{ left, width: 1, background: "var(--accent)" }}
    >
      <div
        className="absolute"
        style={{
          top: 0,
          left: -7,
          width: 15,
          height: 12,
          background: "var(--accent)",
          clipPath: "polygon(0 0, 100% 0, 50% 100%)",
        }}
      />
    </div>
  );
}
