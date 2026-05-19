import { useUIStore } from '@/state/uiStore';

/**
 * Exposes zoom level and zoom actions from uiStore.
 * Components call this instead of subscribing to uiStore directly.
 */
export function useZoom() {
  const zoom = useUIStore((s) => s.zoom);
  const zoomIn = useUIStore((s) => s.zoomIn);
  const zoomOut = useUIStore((s) => s.zoomOut);
  const zoomFit = useUIStore((s) => s.zoomFit);

  return { zoom, zoomIn, zoomOut, zoomFit };
}
