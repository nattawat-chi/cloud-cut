/**
 * RemoteCursors — floating cursor overlays for all collaborators
 * whose cursor target is `'viewport'`.
 *
 * Mount this inside the player/canvas panel so the x/y ratios
 * resolve relative to the video viewport area.
 * Pointer-events are disabled so cursors never swallow clicks.
 */

import { useCollabStore } from '@/state/collabStore';
import { useUIStore } from '@/state/uiStore';

export function RemoteCursors() {
  const cursors       = useCollabStore((s) => s.cursors);
  const collaborators = useCollabStore((s) => s.collaborators);
  const showPresence  = useUIStore((s) => s.showPresence);

  if (!showPresence) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[999]">
      {Object.entries(cursors).map(([uid, cu]) => {
        if (cu.target !== 'viewport' || !cu.visible || cu.x == null || cu.y == null) {
          return null;
        }
        const collab = collaborators.find((c) => c.name === cu.label);
        const color  = collab?.color ?? 'var(--collab-1)';

        return (
          <div
            key={uid}
            className="absolute"
            style={{
              left: `${cu.x * 100}%`,
              top:  `${cu.y * 100}%`,
              transition:
                'left 0.4s cubic-bezier(0.4,0,0.2,1), top 0.4s cubic-bezier(0.4,0,0.2,1)',
              transform: 'translate(-2px, -2px)',
            }}
          >
            {/* Cursor arrow */}
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }}
            >
              <path
                d="M5 3 L19 12 L13 14 L11 21 Z"
                fill={color}
                stroke="white"
                strokeWidth="0.8"
              />
            </svg>

            {/* Name badge */}
            <div
              className="absolute whitespace-nowrap rounded-r-md rounded-b-md px-1.5 py-px
                         text-[10.5px] font-semibold text-white"
              style={{ top: 18, left: 12, background: color, letterSpacing: '0.02em' }}
            >
              {cu.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
