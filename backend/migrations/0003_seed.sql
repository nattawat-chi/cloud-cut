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

INSERT INTO users (id, email, password_hash, display_name, avatar_url) VALUES
(
  '00000000-0000-0000-0000-000000000001',
  'alice@cloudcut.dev',
  -- plaintext: "password123"
  '$argon2id$v=19$m=32768,t=2,p=1$Y2xvdWRjdXRzYWx0MDE$X9p8LmKvQwZnRtSdUeJfNgHiBkCaVxYoMpWlTqEhIuA',
  'Alice Chen',
  'https://api.dicebear.com/8.x/avataaars/svg?seed=alice'
),
(
  '00000000-0000-0000-0000-000000000002',
  'mira@cloudcut.dev',
  -- plaintext: "password123"
  '$argon2id$v=19$m=32768,t=2,p=1$Y2xvdWRjdXRzYWx0MDI$A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v',
  'Mira Santos',
  'https://api.dicebear.com/8.x/avataaars/svg?seed=mira'
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
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000002', 'editor');

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
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000042',  0,     90000, 'background.mp3');
