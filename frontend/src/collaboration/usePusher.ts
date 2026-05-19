/**
 * usePusher — manages the Pusher singleton and exposes connection state.
 *
 * Returns `null` when VITE_PUSHER_KEY is not set so the rest of the app
 * works normally in single-user / offline mode.
 */

import { useEffect, useRef, useState } from 'react';
import type Pusher from 'pusher-js';

import { disconnectPusher, getPusher, isPusherEnabled } from '@/services/pusher';

export type PusherConnectionState =
  | 'disabled'        // VITE_PUSHER_KEY not set
  | 'connecting'
  | 'connected'
  | 'unavailable'
  | 'failed'
  | 'disconnected';

export interface UsePusherResult {
  pusher: Pusher | null;
  connectionState: PusherConnectionState;
  enabled: boolean;
}

export function usePusher(): UsePusherResult {
  const pusherRef = useRef<Pusher | null>(null);
  const [connectionState, setConnectionState] = useState<PusherConnectionState>(
    isPusherEnabled() ? 'connecting' : 'disabled',
  );

  useEffect(() => {
    if (!isPusherEnabled()) {
      setConnectionState('disabled');
      return;
    }

    const instance = getPusher();
    if (!instance) {
      setConnectionState('failed');
      return;
    }

    pusherRef.current = instance;

    // Sync current state immediately
    setConnectionState(instance.connection.state as PusherConnectionState);

    const onStateChange = ({ current }: { current: string }) => {
      setConnectionState(current as PusherConnectionState);
    };

    instance.connection.bind('state_change', onStateChange);

    return () => {
      instance.connection.unbind('state_change', onStateChange);
      disconnectPusher();
      pusherRef.current = null;
    };
  }, []);

  return {
    pusher: pusherRef.current,
    connectionState,
    enabled: isPusherEnabled(),
  };
}
