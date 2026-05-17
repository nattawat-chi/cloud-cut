-- CloudCut — initial schema
-- Run order: 0001 → 0002 → 0003
-- Extensions are pre-created by docker/postgres/init.sql (pgcrypto, uuid-ossp, citext)

-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE plan_tier    AS ENUM ('free', 'pro', 'team');
CREATE TYPE member_role  AS ENUM ('owner', 'admin', 'editor', 'viewer');
CREATE TYPE track_kind   AS ENUM ('video', 'audio', 'subtitle');
CREATE TYPE asset_kind   AS ENUM ('video', 'audio', 'image', 'font');
CREATE TYPE asset_status AS ENUM ('uploading', 'processing', 'ready', 'error');
CREATE TYPE variant_kind AS ENUM (
  'proxy', 'thumbnail', 'waveform',
  'hls_360', 'hls_720', 'hls_1080'
);
CREATE TYPE export_format     AS ENUM ('mp4', 'webm', 'mov');
CREATE TYPE export_resolution AS ENUM ('360', '720', '1080', '2160');
CREATE TYPE job_status        AS ENUM ('queued', 'processing', 'done', 'error');
CREATE TYPE effect_type       AS ENUM (
  'brightness', 'contrast', 'saturation', 'blur',
  'sharpen', 'hue_rotate', 'sepia', 'grayscale'
);

-- ─── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT NOT NULL UNIQUE,
  password_hash TEXT   NOT NULL,
  display_name  TEXT   NOT NULL,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Refresh tokens stored server-side so we can revoke on logout / suspicious activity.
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,   -- SHA-256 of the opaque token
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ
);

-- ─── Workspaces & membership ──────────────────────────────────────────────────

CREATE TABLE workspaces (
  id         UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT      NOT NULL,
  owner_id   UUID      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  plan       plan_tier NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspace_members (
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  role         member_role NOT NULL DEFAULT 'editor',
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE invitations (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email        CITEXT      NOT NULL,
  token        TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by   UUID        NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  role         member_role NOT NULL DEFAULT 'editor',
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days',
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Projects ─────────────────────────────────────────────────────────────────

CREATE TABLE projects (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID  NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT  NOT NULL,
  description   TEXT  NOT NULL DEFAULT '',
  fps           SMALLINT NOT NULL DEFAULT 30 CHECK (fps BETWEEN 1 AND 120),
  resolution_w  INTEGER  NOT NULL DEFAULT 1920 CHECK (resolution_w > 0),
  resolution_h  INTEGER  NOT NULL DEFAULT 1080 CHECK (resolution_h > 0),
  duration_ms   BIGINT   NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  thumbnail_url TEXT,
  archived      BOOLEAN  NOT NULL DEFAULT false,
  created_by    UUID  NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Tracks ───────────────────────────────────────────────────────────────────

CREATE TABLE tracks (
  id         UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID       NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind       track_kind NOT NULL,
  name       TEXT       NOT NULL,
  position   SMALLINT   NOT NULL DEFAULT 0,  -- display order within project
  muted      BOOLEAN    NOT NULL DEFAULT false,
  locked     BOOLEAN    NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Assets ───────────────────────────────────────────────────────────────────

CREATE TABLE assets (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID         NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT         NOT NULL,
  kind         asset_kind   NOT NULL,
  size_bytes   BIGINT       NOT NULL DEFAULT 0,
  duration_ms  BIGINT,                         -- null for images/fonts
  width        INTEGER,
  height       INTEGER,
  original_key TEXT         NOT NULL,          -- S3 object key
  status       asset_status NOT NULL DEFAULT 'uploading',
  uploaded_by  UUID         NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- One row per ffmpeg output (proxy, thumbnail, waveform JSON, HLS variants).
CREATE TABLE asset_variants (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id     UUID         NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  variant      variant_kind NOT NULL,
  s3_key       TEXT         NOT NULL,
  content_type TEXT         NOT NULL,
  size_bytes   BIGINT       NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (asset_id, variant)
);

-- ─── Clips ────────────────────────────────────────────────────────────────────

CREATE TABLE clips (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id    UUID    NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  asset_id    UUID    REFERENCES assets(id) ON DELETE SET NULL,   -- null = generated/placeholder
  pos_ms      BIGINT  NOT NULL DEFAULT 0 CHECK (pos_ms >= 0),
  dur_ms      BIGINT  NOT NULL DEFAULT 1000 CHECK (dur_ms >= 400),
  trim_in_ms  BIGINT  NOT NULL DEFAULT 0 CHECK (trim_in_ms >= 0),
  trim_out_ms BIGINT  NOT NULL DEFAULT 0 CHECK (trim_out_ms >= 0),
  speed       NUMERIC(5,2) NOT NULL DEFAULT 1.0 CHECK (speed > 0),
  name        TEXT    NOT NULL,
  version     INTEGER NOT NULL DEFAULT 0,   -- optimistic-lock counter
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Clip effects ─────────────────────────────────────────────────────────────

CREATE TABLE clip_effects (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id    UUID        NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  type       effect_type NOT NULL,
  value      NUMERIC(8,4) NOT NULL DEFAULT 0,
  enabled    BOOLEAN      NOT NULL DEFAULT true,
  position   SMALLINT     NOT NULL DEFAULT 0,  -- render order
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ─── Transitions ──────────────────────────────────────────────────────────────

CREATE TABLE transitions (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_clip_id UUID    REFERENCES clips(id) ON DELETE SET NULL,
  to_clip_id   UUID    REFERENCES clips(id) ON DELETE SET NULL,
  type         TEXT    NOT NULL,
  duration_ms  INTEGER NOT NULL DEFAULT 500 CHECK (duration_ms > 0),
  params       JSONB   NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Text overlays ────────────────────────────────────────────────────────────

CREATE TABLE text_overlays (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  track_id   UUID    NOT NULL REFERENCES tracks(id)   ON DELETE CASCADE,
  pos_ms     BIGINT  NOT NULL DEFAULT 0  CHECK (pos_ms >= 0),
  dur_ms     BIGINT  NOT NULL DEFAULT 5000 CHECK (dur_ms >= 400),
  content    TEXT    NOT NULL DEFAULT '',
  style      JSONB   NOT NULL DEFAULT '{}'::jsonb,   -- font, color, position, animation
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Export jobs ──────────────────────────────────────────────────────────────

CREATE TABLE export_jobs (
  id            UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID              NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requested_by  UUID              NOT NULL REFERENCES users(id)    ON DELETE SET NULL,
  status        job_status        NOT NULL DEFAULT 'queued',
  format        export_format     NOT NULL DEFAULT 'mp4',
  resolution    export_resolution NOT NULL DEFAULT '1080',
  output_key    TEXT,                        -- S3 key, set when done
  progress_pct  SMALLINT          NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  error_msg     TEXT,
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Operation logs (collaboration) ───────────────────────────────────────────
-- Append-only log of every timeline mutation. Used for real-time sync (Pusher)
-- and as the authoritative audit trail. Partitioned monthly in 0002.
CREATE TABLE operation_logs (
  id         BIGSERIAL   NOT NULL,
  project_id UUID        NOT NULL,   -- no FK — cross-partition JOIN avoided
  user_id    UUID        NOT NULL,
  op_type    TEXT        NOT NULL,   -- 'move_clip' | 'resize_clip' | 'split_clip' | …
  payload    JSONB       NOT NULL,   -- full before+after state for undo/redo replay
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, applied_at)       -- partition key must be part of PK
) PARTITION BY RANGE (applied_at);

-- Seed the first two monthly partitions so the table is immediately usable.
CREATE TABLE operation_logs_2026_01 PARTITION OF operation_logs
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE operation_logs_2026_02 PARTITION OF operation_logs
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE operation_logs_2026_03 PARTITION OF operation_logs
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE operation_logs_2026_04 PARTITION OF operation_logs
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE operation_logs_2026_05 PARTITION OF operation_logs
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE operation_logs_2026_06 PARTITION OF operation_logs
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- ─── updated_at auto-bump trigger ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_clips_updated_at
  BEFORE UPDATE ON clips
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_text_overlays_updated_at
  BEFORE UPDATE ON text_overlays
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
