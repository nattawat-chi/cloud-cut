import { useUIStore } from '@/state/uiStore';

interface SnapGuideProps {
  positionPx: number;
}

/** Vertical snap guide line rendered over the timeline when a clip snaps to an edge. */
export function SnapGuide({ positionPx }: SnapGuideProps) {
  const snapEnabled = useUIStore((s) => s.snapEnabled);
  if (!snapEnabled || positionPx < 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-30 w-px bg-accent opacity-80"
      style={{ left: positionPx }}
    />
  );
}
