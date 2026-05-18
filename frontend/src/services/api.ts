/**
 * Typed HTTP client for the CloudCut backend.
 *
 * - Reads base URL from `VITE_API_BASE` (default `/api/v1`).
 * - Pulls the access token from `authStore` on every call (no closure capture
 *   so token rotation after refresh works without re-creating the client).
 * - Normalises backend errors `{ error, code }` → `ApiError` with status code.
 *
 * Convention: function names mirror the backend route shape:
 *   `auth.login()`     → POST /auth/login
 *   `projects.list()`  → GET /workspaces/:ws_id/projects
 *   `timeline.get()`   → GET /projects/:id/timeline
 */

import { useAuthStore } from '@/state/authStore';

// ─── Base helpers ────────────────────────────────────────────────────────────

const BASE_URL = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  /** Override content-type. JSON by default. */
  readonly contentType?: string;
  /** Skip the Authorization header (login/register only). */
  readonly anonymous?: boolean;
  /** Raw body — bypasses JSON serialisation (used for x-www-form-urlencoded). */
  readonly rawBody?: BodyInit;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  const resp = await fetchOnce(method, path, body, opts);

  // ── One-shot 401 retry via refresh token ────────────────────────────────────
  // If the access token expired between page load and this call, transparently
  // mint a new one and replay the request. Anonymous calls (login/register) and
  // refresh itself skip this path to avoid recursion.
  if (resp.status === 401 && !opts.anonymous && path !== '/auth/refresh') {
    const ok = await useAuthStore.getState().refresh();
    if (ok) {
      const retry = await fetchOnce(method, path, body, opts);
      return await consume<T>(retry);
    }
    // refresh failed → caller will see ApiError(401) and the auth gate in
    // App.tsx will flip back to the login screen (no token in store).
  }

  return await consume<T>(resp);
}

async function fetchOnce(
  method: string,
  path: string,
  body: unknown,
  opts: RequestOptions,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (!opts.rawBody && body !== undefined) {
    headers['Content-Type'] = opts.contentType ?? 'application/json';
  }
  if (!opts.anonymous) {
    const token = useAuthStore.getState().accessToken;
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const init: RequestInit = { method, headers };
  if (opts.rawBody !== undefined) {
    init.body = opts.rawBody;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return fetch(`${BASE_URL}${path}`, init);
}

async function consume<T>(resp: Response): Promise<T> {
  if (resp.status === 204) return undefined as T;

  const text = await resp.text();
  const parsed: unknown = text ? safeJson(text) : undefined;

  if (!resp.ok) {
    const errBody = parsed as { error?: string; code?: string } | undefined;
    throw new ApiError(
      resp.status,
      errBody?.code ?? 'UNKNOWN',
      errBody?.error ?? `HTTP ${resp.status}`,
    );
  }
  return parsed as T;
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return undefined; }
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface UserResponse {
  readonly id: string;
  readonly email: string;
  readonly display_name: string;
  readonly avatar_url: string | null;
  readonly created_at: string;
}

export interface TokenPair {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly token_type: string;
  readonly expires_in: number;
  readonly user: UserResponse;
}

export const auth = {
  register: (email: string, password: string, display_name: string) =>
    request<TokenPair>('POST', '/auth/register', { email, password, display_name }, { anonymous: true }),

  login: (email: string, password: string) =>
    request<TokenPair>('POST', '/auth/login', { email, password }, { anonymous: true }),

  refresh: (refresh_token: string) =>
    request<{ access_token: string; token_type: string; expires_in: number }>(
      'POST', '/auth/refresh', { refresh_token }, { anonymous: true },
    ),

  logout: (refresh_token: string) =>
    request<void>('POST', '/auth/logout', { refresh_token }),

  me: () => request<UserResponse>('GET', '/auth/me'),
};

// ─── Workspaces ──────────────────────────────────────────────────────────────

export interface WorkspaceResponse {
  readonly id: string;
  readonly name: string;
  readonly plan: string;
  readonly role: string;
  readonly created_at: string;
}

export const workspaces = {
  list: () => request<WorkspaceResponse[]>('GET', '/workspaces'),
};

// ─── Projects ────────────────────────────────────────────────────────────────

export interface ProjectResponse {
  readonly id: string;
  readonly workspace_id: string;
  readonly name: string;
  readonly description: string;
  readonly fps: number;
  readonly resolution_w: number;
  readonly resolution_h: number;
  readonly duration_ms: number;
  readonly thumbnail_url: string | null;
  readonly archived: boolean;
  readonly created_by: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export const projects = {
  list: (workspaceId: string, cursor?: string) => {
    const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return request<{ items: ProjectResponse[]; next_cursor: string | null }>(
      'GET', `/workspaces/${workspaceId}/projects${q}`,
    );
  },
  get: (id: string) => request<ProjectResponse>('GET', `/projects/${id}`),
  create: (workspaceId: string, body: { name: string; description?: string }) =>
    request<ProjectResponse>('POST', `/workspaces/${workspaceId}/projects`, body),
};

// ─── Timeline ────────────────────────────────────────────────────────────────

export interface TrackResponse {
  readonly id: string;
  readonly project_id: string;
  readonly kind: 'video' | 'audio' | 'subtitle';
  readonly name: string;
  readonly position: number;
  readonly muted: boolean;
  readonly locked: boolean;
  readonly created_at: string;
}

export interface ClipResponse {
  readonly id: string;
  readonly track_id: string;
  readonly asset_id: string | null;
  readonly pos_ms: number;
  readonly dur_ms: number;
  readonly trim_in_ms: number;
  readonly trim_out_ms: number;
  readonly speed: number;
  readonly name: string;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface EffectResponse {
  readonly id: string;
  readonly clip_id: string;
  readonly type: string;
  readonly value: number;
  readonly enabled: boolean;
  readonly position: number;
  readonly created_at: string;
}

export interface TimelineSnapshot {
  readonly tracks: TrackResponse[];
  readonly clips: ClipResponse[];
  readonly effects: Record<string, EffectResponse[]>;
}

export const timeline = {
  get: (projectId: string) => request<TimelineSnapshot>('GET', `/projects/${projectId}/timeline`),

  addClip: (trackId: string, body: { asset_id?: string; pos_ms: number; dur_ms: number; name: string }) =>
    request<ClipResponse>('POST', `/tracks/${trackId}/clips`, body),

  updateClip: (clipId: string, body: Partial<{ pos_ms: number; dur_ms: number; track_id: string }>) =>
    request<ClipResponse>('PATCH', `/clips/${clipId}`, body),

  deleteClip: (clipId: string) => request<void>('DELETE', `/clips/${clipId}`),

  splitClip: (clipId: string, splitAtMs: number) =>
    request<ClipResponse[]>('POST', `/clips/${clipId}/split`, { split_at_ms: splitAtMs }),
};

// ─── Assets ──────────────────────────────────────────────────────────────────

export interface AssetResponse {
  readonly id: string;
  readonly workspace_id: string;
  readonly name: string;
  readonly kind: 'video' | 'audio' | 'image' | 'font';
  readonly size_bytes: number;
  readonly duration_ms: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly original_key: string;
  readonly status: 'uploading' | 'processing' | 'ready' | 'error';
  readonly uploaded_by: string;
  readonly created_at: string;
}

export interface PresignResponse {
  readonly asset_id: string;
  readonly upload_url: string;
  readonly s3_key: string;
  readonly expires_in: number;
}

export const assets = {
  list: (workspaceId: string) =>
    request<{ items: AssetResponse[]; next_cursor: string | null }>(
      'GET', `/workspaces/${workspaceId}/assets`,
    ),

  presign: (workspaceId: string, body: { filename: string; kind: string; size_bytes: number }) =>
    request<PresignResponse>('POST', `/workspaces/${workspaceId}/assets/presign`, body),

  updateStatus: (assetId: string, body: { status: string; duration_ms?: number; width?: number; height?: number }) =>
    request<AssetResponse>('PATCH', `/assets/${assetId}/status`, body),
};

// ─── Exports ─────────────────────────────────────────────────────────────────

export interface ExportJobResponse {
  readonly id: string;
  readonly project_id: string;
  readonly status: 'queued' | 'processing' | 'done' | 'error';
  readonly format: string;
  readonly resolution: string;
  readonly output_key: string | null;
  readonly progress_pct: number;
  readonly error_msg: string | null;
}

export const exports_ = {
  create: (projectId: string, body: { format?: string; resolution?: string }) =>
    request<{ job: ExportJobResponse; stream_id: string }>(
      'POST', `/projects/${projectId}/exports`, body,
    ),
  get: (jobId: string) => request<ExportJobResponse>('GET', `/exports/${jobId}`),
  list: (projectId: string) => request<ExportJobResponse[]>('GET', `/projects/${projectId}/exports`),
};
