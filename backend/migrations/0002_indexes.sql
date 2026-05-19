-- CloudCut — indexes with rationale
-- Every index below documents WHY it exists so the reviewer can judge the trade-off.

-- ─── Users ────────────────────────────────────────────────────────────────────

-- email is already UNIQUE (implicit B-tree) — login lookup O(log n).

-- Partial index: only non-revoked tokens need to be quickly looked up.
CREATE INDEX idx_refresh_tokens_active
  ON refresh_tokens (user_id, expires_at)
  WHERE revoked_at IS NULL;

-- ─── Workspaces ───────────────────────────────────────────────────────────────

-- "List my workspaces" is the home-page query for every logged-in user.
CREATE INDEX idx_workspace_members_user
  ON workspace_members (user_id);

-- Invitation lookup by token is the only hot path (email-link click).
-- token already has UNIQUE B-tree from the DDL; this is just documentation.

-- Pending-only partial index: expired/accepted invitations are read-rarely.
CREATE INDEX idx_invitations_pending
  ON invitations (workspace_id, email)
  WHERE accepted_at IS NULL;

-- ─── Projects ─────────────────────────────────────────────────────────────────

-- "List active projects in workspace" — main project browser query.
CREATE INDEX idx_projects_workspace_active
  ON projects (workspace_id, updated_at DESC)
  WHERE archived = false;

-- ─── Tracks ───────────────────────────────────────────────────────────────────

-- All tracks for a project, ordered by display position.
CREATE INDEX idx_tracks_project_pos
  ON tracks (project_id, position);

-- ─── Assets ───────────────────────────────────────────────────────────────────

-- Asset browser: list by workspace + kind + creation time.
CREATE INDEX idx_assets_workspace_kind
  ON assets (workspace_id, kind, created_at DESC);

-- Worker picks up assets that need processing.
CREATE INDEX idx_assets_processing
  ON assets (status, created_at)
  WHERE status IN ('uploading', 'processing');

-- ─── Clips ────────────────────────────────────────────────────────────────────

-- Load all clips for a project's tracks in one pass (via track_id set).
CREATE INDEX idx_clips_track
  ON clips (track_id, pos_ms);

-- Timeline rendering needs clips ordered by position; covering index avoids heap fetch.
CREATE INDEX idx_clips_track_pos_covering
  ON clips (track_id, pos_ms, dur_ms, name, version);

-- ─── Clip effects ─────────────────────────────────────────────────────────────

-- Effects panel: load all effects for a clip, ordered.
CREATE INDEX idx_clip_effects_clip_pos
  ON clip_effects (clip_id, position);

-- ─── Export jobs ──────────────────────────────────────────────────────────────

-- Worker polls for queued jobs.
CREATE INDEX idx_export_jobs_queued
  ON export_jobs (created_at)
  WHERE status = 'queued';

-- Project export history shown in UI.
CREATE INDEX idx_export_jobs_project
  ON export_jobs (project_id, created_at DESC);

-- ─── Operation logs ───────────────────────────────────────────────────────────
-- Partitioned table: each partition gets its own index automatically when created
-- via PARTITION OF. We create the index on the parent and PG propagates it.

-- Real-time sync: tail the log for a project since a known sequence id.
CREATE INDEX idx_oplog_project_time
  ON operation_logs (project_id, applied_at DESC, id DESC);

-- Per-user audit trail.
CREATE INDEX idx_oplog_user_time
  ON operation_logs (user_id, applied_at DESC);

-- op_type filter (e.g. replay only 'move_clip' ops for timeline scrub).
CREATE INDEX idx_oplog_project_optype
  ON operation_logs (project_id, op_type, applied_at DESC);
