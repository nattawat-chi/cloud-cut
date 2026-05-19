import { useEffect, useRef } from 'react';
import type Pusher from 'pusher-js';

import { disconnectPusher, getPusher, isPusherEnabled } from '@/services/pusher';

/**
 * Returns the Pusher singleton (or null when Pusher is not configured).
 * Disconnects cleanly on unmount.
 */
export function usePusher(): Pusher | null {
  const pusherRef = useRef<Pusher | null>(null);

  useEffect(() => {
    if (!isPusherEnabled()) return;
    pusherRef.current = getPusher();

    return () => {
      disconnectPusher();
      pusherRef.current = null;
    };
  }, []);

  return pusherRef.current;
}
