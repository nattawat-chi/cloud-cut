-- CloudCut — development seed data
-- Inserts one workspace, two users, and a sample project so the dev
-- environment has a working login immediately after `docker compose up`.
--
-- Passwords are Argon2id hashes of the plaintext shown in comments.
-- Re-generate with: echo -n "password" | argon2 salt -id -t 2 -m 15 -p 1
--
-- WARNING: never run this migration in production (gated by SEED_DATA env-var
-- check in the migration runner wrapper).

-- ─── Users ────────────────────────────────────────────────────────────────────

-- All seed accounts share the password "password123". The hash below was
-- produced by `cargo run -p backend --example gen_hash -- password123` so it
-- verifies against the real Argon2id verifier in auth/handlers.rs.
--
-- Role matrix (§2.6):
--   alice  → owner   — full access
--   mira   → admin   — full access, can invite/manage members
--   carlos → editor  — can edit timeline, upload, export; cannot invite/manage
--   sofia  → viewer  — read-only
INSERT INTO users (id, email, password_hash, display_name, avatar_url) VALUES
(
  '00000000-0000-0000-0000-000000000001',
  'alice@cloudcut.dev',
  '$argon2id$v=19$m=19456,t=2,p=1$rjiy0AsmSYidiTnvGd77Zw$9ftmhIrEjSKniTzQC5mXx4h6xtxo09INEhKSn8EsvzE',
  'Alice Chen',
  'https://api.dicebear.com/8.x/avataaars/svg?seed=alice'
),
(
  '00000000-0000-0000-0000-000000000002',
  'mira@cloudcut.dev',
  '$argon2id$v=19$m=19456,t=2,p=1$rjiy0AsmSYidiTnvGd77Zw$9ftmhIrEjSKniTzQC5mXx4h6xtxo09INEhKSn8EsvzE',
  'Mira Santos',
  'https://api.dicebear.com/8.x/avataaars/svg?seed=mira'
),
(
  '00000000-0000-0000-0000-000000000003',
  'carlos@cloudcut.dev',
  '$argon2id$v=19$m=19456,t=2,p=1$rjiy0AsmSYidiTnvGd77Zw$9ftmhIrEjSKniTzQC5mXx4h6xtxo09INEhKSn8EsvzE',
  'Carlos Rivera',
  'https://api.dicebear.com/8.x/avataaars/svg?seed=carlos'
),
(
  '00000000-0000-0000-0000-000000000004',
  'sofia@cloudcut.dev',
  '$argon2id$v=19$m=19456,t=2,p=1$rjiy0AsmSYidiTnvGd77Zw$9ftmhIrEjSKniTzQC5mXx4h6xtxo09INEhKSn8EsvzE',
  'Sofia Kim',
  'https://api.dicebear.com/8.x/avataaars/svg?seed=sofia'
);

-- ─── Workspace ────────────────────────────────────────────────────────────────

INSERT INTO workspaces (id, name, owner_id, plan) VALUES (
  '00000000-0000-0000-0000-000000000010',
  'CloudCut Demo Workspace',
  '00000000-0000-0000-0000-000000000001',
  'pro'
);

INSERT INTO workspace_members (workspace_id, user_id, role) VALUES
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'owner'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000002', 'admin'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000003', 'editor'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000004', 'viewer');

-- ─── Project ──────────────────────────────────────────────────────────────────

INSERT INTO projects (id, workspace_id, name, description, fps, resolution_w, resolution_h, duration_ms, created_by) VALUES (
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000010',
  'Q4 Product Demo — CloudCut Launch',
  'Main launch video for CloudCut Q4 product announcement.',
  30,
  1920,
  1080,
  120000,
  '00000000-0000-0000-0000-000000000001'
);

-- ─── Tracks ───────────────────────────────────────────────────────────────────

INSERT INTO tracks (id, project_id, kind, name, position) VALUES
  ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000020', 'video', 'Video 1', 0),
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000020', 'video', 'Video 2', 1),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000020', 'audio', 'Music',   2),
  ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000020', 'audio', 'SFX',     3);

-- ─── Assets (placeholders — worker fills orignal_key after upload) ─────────────

INSERT INTO assets (id, workspace_id, name, kind, duration_ms, width, height, original_key, status, uploaded_by) VALUES
  ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000010', 'hero_shot.mp4',    'video', 30000, 1920, 1080, 'originals/hero_shot.mp4',    'ready', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000010', 'product_demo.mp4', 'video', 45000, 1920, 1080, 'originals/product_demo.mp4', 'ready', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000010', 'background.mp3',   'audio', 90000, NULL, NULL, 'originals/background.mp3',   'ready', '00000000-0000-0000-0000-000000000002');

-- ─── Clips ────────────────────────────────────────────────────────────────────

INSERT INTO clips (id, track_id, asset_id, pos_ms, dur_ms, name) VALUES
  ('00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000040',  0,     30000, 'hero_shot.mp4'),
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000041', 30000,  45000, 'product_demo.mp4'),
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000042',  0,     90000, 'background.mp3'),
  -- Extra clip on V2 (B-roll overlap with hero_shot) — exercises overlap/composite paths in tests
  ('00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000041', 10000,  15000, 'product_demo_broll.mp4'),
  -- SFX clip on A2 — second audio track, short percussive insert
  ('00000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000042', 25000,  3000,  'sfx_whoosh.mp3');

-- ─── Project #2 (Marketing reel — sparse but valid) ───────────────────────────
-- A second project in the same workspace exercises multi-project flows:
-- workspace-scoped asset reuse, per-project rate-limit boundaries, and the
-- TopBar project dropdown that needs ≥2 entries to be meaningful.

INSERT INTO projects (id, workspace_id, name, description, fps, resolution_w, resolution_h, duration_ms, created_by) VALUES (
  '00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-000000000010',
  'Social Cuts — Vertical Reels',
  '15-second vertical edits for IG/TikTok.',
  30, 1080, 1920, 15000,
  '00000000-0000-0000-0000-000000000003'  -- Carlos (editor) created it
);

INSERT INTO tracks (id, project_id, kind, name, position) VALUES
  ('00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000021', 'video', 'Video 1', 0),
  ('00000000-0000-0000-0000-000000000035', '00000000-0000-0000-0000-000000000021', 'audio', 'Audio 1', 1);

INSERT INTO clips (id, track_id, asset_id, pos_ms, dur_ms, name) VALUES
  ('00000000-0000-0000-0000-000000000055', '00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000040', 0, 15000, 'hero_shot_short.mp4'),
  ('00000000-0000-0000-0000-000000000056', '00000000-0000-0000-0000-000000000035', '00000000-0000-0000-0000-000000000042', 0, 15000, 'background_trim.mp3');

-- ─── Clip effects (sample — exercises filter graph + Inspector UI) ────────────
-- One brightness + one contrast on the hero shot, a saturation boost on the
-- B-roll, and a disabled blur on the demo clip (proves enabled=false is
-- rendered as "off" in the UI without removing the row).

INSERT INTO clip_effects (id, clip_id, type, value, enabled, position) VALUES
  ('00000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000050', 'brightness', 0.08, true,  0),
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000050', 'contrast',   1.18, true,  1),
  ('00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000053', 'saturation', 1.25, true,  0),
  ('00000000-0000-0000-0000-000000000063', '00000000-0000-0000-0000-000000000051', 'blur',       2.00, false, 0);

-- ─── Sample export jobs ───────────────────────────────────────────────────────
-- One completed (with output_key + finished_at populated so the Export dialog
-- can render the download link) and one mid-flight at 42% so the progress bar
-- has a non-trivial value on a fresh login.

INSERT INTO export_jobs (id, project_id, requested_by, status, format, resolution, output_key, progress_pct, started_at, finished_at, created_at) VALUES
  (
    '00000000-0000-0000-0000-000000000070',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000001',
    'done', 'mp4', '1080',
    'exports/00000000-0000-0000-0000-000000000020/00000000-0000-0000-0000-000000000070/output.mp4',
    100,
    now() - interval '15 minutes',
    now() - interval '12 minutes',
    now() - interval '15 minutes'
  ),
  (
    '00000000-0000-0000-0000-000000000071',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000003',
    'processing', 'webm', '720',
    NULL,
    42,
    now() - interval '90 seconds',
    NULL,
    now() - interval '90 seconds'
  );

-- ─── Sample operation logs (collaboration audit trail) ────────────────────────
-- A handful of representative ops on Project #1 so:
--   1. The History panel shows non-empty content on first load.
--   2. The "give me ops since seq=X" reconciliation query has rows to chew.
--   3. The partition routing (applied_at) is exercised on every test boot.

INSERT INTO operation_logs (project_id, user_id, op_type, payload, applied_at) VALUES
  (
    '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001',
    'clip.add',
    '{"clip_id":"00000000-0000-0000-0000-000000000050","track_id":"00000000-0000-0000-0000-000000000030","pos_ms":0,"dur_ms":30000}'::jsonb,
    now() - interval '45 minutes'
  ),
  (
    '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001',
    'clip.move',
    '{"clip_id":"00000000-0000-0000-0000-000000000051","from":{"pos_ms":15000},"to":{"pos_ms":30000}}'::jsonb,
    now() - interval '40 minutes'
  ),
  (
    '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000002',
    'effect.add',
    '{"clip_id":"00000000-0000-0000-0000-000000000050","effect":{"type":"brightness","value":0.08,"enabled":true}}'::jsonb,
    now() - interval '30 minutes'
  ),
  (
    '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000003',
    'clip.trim',
    '{"clip_id":"00000000-0000-0000-0000-000000000051","from":{"dur_ms":50000},"to":{"dur_ms":45000}}'::jsonb,
    now() - interval '20 minutes'
  ),
  (
    '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000003',
    'effect.update',
    '{"clip_id":"00000000-0000-0000-0000-000000000050","effect_id":"00000000-0000-0000-0000-000000000061","from":1.0,"to":1.18}'::jsonb,
    now() - interval '10 minutes'
  );
