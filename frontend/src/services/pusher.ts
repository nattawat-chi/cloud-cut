/**
 * Pusher client singleton. Returns `null` when env vars are missing so the rest
 * of the app keeps working in dev mode (the legacy CollabSimulator takes over).
 *
 * Real env vars:
 *   VITE_PUSHER_KEY       — public app key
 *   VITE_PUSHER_CLUSTER   — e.g. "ap1", "mt1"
 *   VITE_API_BASE         — backend base URL for /api/v1/pusher/auth
 *   VITE_AUTH_TOKEN       — (optional) JWT for the auth endpoint; in production
 *                           this comes from the login flow / store
 */

import Pusher from 'pusher-js';

import { useAuthStore } from '@/state/authStore';

const KEY = import.meta.env.VITE_PUSHER_KEY as string | undefined;
const CLUSTER = (import.meta.env.VITE_PUSHER_CLUSTER as string | undefined) ?? 'mt1';
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1';

let instance: Pusher | null = null;

export function getPusher(): Pusher | null {
  if (!KEY) return null;
  if (instance) return instance;

  Pusher.logToConsole = import.meta.env.DEV && import.meta.env.VITE_PUSHER_DEBUG === '1';

  instance = new Pusher(KEY, {
    cluster: CLUSTER,
    forceTLS: true,
    authEndpoint: `${API_BASE}/pusher/auth`,
    // Function form so the latest access token is read on every channel auth
    // (matters after a token refresh — closure-captured headers would go stale).
    auth: { headers: {} },
    authorizer: (channel) => ({
      authorize: (socketId, callback) => {
        const token = useAuthStore.getState().accessToken;
        const body = new URLSearchParams({
          socket_id: socketId,
          channel_name: channel.name,
        });
        fetch(`${API_BASE}/pusher/auth`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body,
        })
          .then(async (r) => {
            if (!r.ok) throw new Error(`auth ${r.status}`);
            return r.json();
          })
          .then((data) => callback(null, data))
          .catch((err) => callback(err, null));
      },
    }),
  });

  return instance;
}

/** Returns true if Pusher is configured and enabled. */
export function isPusherEnabled(): boolean {
  return Boolean(KEY);
}

/** Cleanly disconnect — call on logout / hot-reload teardown. */
export function disconnectPusher(): void {
  if (instance) {
    instance.disconnect();
    instance = null;
  }
}

