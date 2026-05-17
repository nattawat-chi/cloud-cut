import { useUIStore } from '@/state/uiStore';
import type { Theme } from '@/types';

/**
 * Convenience hook around the uiStore theme slice.
 *
 * Phase 1.2 implemented `useTheme` as a standalone hook with its own
 * `useState` + localStorage logic. Phase 1.3 moved that ownership into
 * `uiStore` so other components (Tweaks panel, keyboard shortcuts) can
 * read/write theme consistently. This hook is retained as a thin facade
 * so components don't have to know whether theme lives in the store or
 * a hook — callsite ergonomics stay the same.
 */
export function useTheme(): {
  theme: Theme;
  toggle: () => void;
  set: (t: Theme) => void;
} {
  const theme = useUIStore((s) => s.theme);
  const toggle = useUIStore((s) => s.toggleTheme);
  const set = useUIStore((s) => s.setTheme);
  return { theme, toggle, set };
}
