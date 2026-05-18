/* =============================================================================
   usePusher — Pusher Channels JS client lifecycle.
   Phase 1.7 ran on a scripted simulator; Phase 5 swaps the simulator out for
   a real Pusher subscription.  This hook owns the *connection* lifecycle —
   instantiate once, expose subscribe/unsubscribe, tear down on unmount.

   `pusher-js` is not yet a dependency.  The hook is written against a
   structurally-typed `PusherLike` interface so it compiles today and only
   needs an `import Pusher from "pusher-js"` line in Phase 5.
   ============================================================================= */

import { useEffect, useRef, useState } from 'react';

export type ChannelKind = 'private' | 'presence' | 'public';

export interface PusherLike {
  subscribe(channelName: string): ChannelLike;
  unsubscribe(channelName: string): void;
  disconnect(): void;
  connection: { state: string };
}

export interface ChannelLike {
  bind(event: string, callback: (data: unknown) => void): void;
  unbind(event: string, callback?: (data: unknown) => void): void;
  trigger?(event: string, payload: unknown): void;
}

export interface PusherConfig {
  key:     string;
  cluster: string;
  /** POST endpoint that signs presence/private channel auth requests. */
  authEndpoint: string;
  /** Bearer token forwarded with every auth request. */
  authToken?: string;
}

export interface UsePusherResult {
  client: PusherLike | null;
  connected: boolean;
}

/**
 * Connect once on mount, disconnect on unmount.  Returns the live client (or
 * `null` until the dependency loads) so callers can subscribe to channels.
 */
export function usePusher(config: PusherConfig | null): UsePusherResult {
  const clientRef = useRef<PusherLike | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!config) return;

    let cancelled = false;

    void (async () => {
      // Phase 5:
      //   const { default: Pusher } = await import('pusher-js');
      //   const client = new Pusher(config.key, { cluster: config.cluster, ... });
      // Until then, the stub keeps connected=false so consumers fall back to
      // their local-only paths.
      const stub: PusherLike = {
        subscribe:   () => ({ bind: () => {}, unbind: () => {} }),
        unsubscribe: () => {},
        disconnect:  () => {},
        connection:  { state: 'disconnected' },
      };
      if (cancelled) return;
      clientRef.current = stub;
      setConnected(false);
    })();

    return () => {
      cancelled = true;
      clientRef.current?.disconnect();
      clientRef.current = null;
      setConnected(false);
    };
  }, [config]);

  return { client: clientRef.current, connected };
}
