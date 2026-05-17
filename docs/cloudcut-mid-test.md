# 🖥️ CloudCut — Rust + React Full-Stack Engineering Challenge 

## โจทย์สอบ Full-Stack Engineer: SaaS Video Editor

**ระดับ:** Mid–Senior Full-Stack Engineer
**เวลา:** 3–5 วัน
**Stack:** Rust + PostgreSQL + Redis + ffmpeg + React 19 + shadcn/ui + Pusher

---

## 📋 บทนำ

CloudCut เป็น **collaborative video editing SaaS** ที่ทำงานบน browser สำหรับการตัดต่อวิดีโอร่วมกันแบบ real-time

ผู้สมัครต้องสร้าง **working prototype** ที่ครอบคลุม 5 ส่วนหลัก:

| # | ส่วน                    | เนื้อหา                                         |
| - | ----------------------- | ----------------------------------------------- |
| 1 | Database                | Schema design, migrations, seed data            |
| 2 | Backend API             | Rust REST API, auth, validation, authorization  |
| 3 | Queue & Processing      | Rust worker queue + ffmpeg processing pipeline  |
| 4 | Real-time Collaboration | Pusher presence + operation sync                |
| 5 | Editor UI               | React + shadcn/ui — timeline, player, inspector |

> ไม่จำเป็นต้องทำครบทุกข้อ ระบบคะแนนเป็น dynamic ตามความสมบูรณ์ของแต่ละส่วน

---

# 🧱 Tech Stack

## Backend

```txt
Rust
Axum หรือ Actix Web
Tokio
PostgreSQL
SQLx หรือ SeaORM
Redis
Redis Streams / Apalis / PostgreSQL job table
ffmpeg CLI
JWT Auth
Tower middleware
utoipa OpenAPI
tracing
```

## Frontend

```txt
React 19
TypeScript strict
Vite
shadcn/ui
Tailwind CSS
Zustand
Pusher JS
Vitest
Playwright optional
```

---

# 🎯 Task 1: Database Schema Design

## 1.1 ออกแบบ PostgreSQL Schema

ออกแบบ PostgreSQL schema สำหรับระบบ collaborative video editor โดยครอบคลุม users, workspaces, projects, assets, timeline, export jobs และ operation logs

ผู้สมัครสามารถเลือกส่งได้ 1 รูปแบบ:

```txt
Option A: raw SQL migrations
Option B: SQLx migrations
Option C: SeaORM entities + migrations
```

---

## Core Entities

### Users & Workspaces

```txt
User
├── id
├── email
├── password_hash
├── name
├── avatar_url
├── oauth_provider
├── created_at
├── updated_at
├── deleted_at

Workspace
├── id
├── name
├── slug
├── plan: free | pro | team
├── owner_id → User
├── created_at
├── updated_at
├── deleted_at

WorkspaceMember
├── id
├── workspace_id → Workspace
├── user_id → User
├── role: owner | admin | editor | viewer
├── created_at
├── updated_at

Invitation
├── id
├── workspace_id → Workspace
├── email
├── role: admin | editor | viewer
├── status: pending | accepted | expired
├── token
├── expires_at
├── created_at
```

---

### Projects & Assets

```txt
Project
├── id
├── workspace_id → Workspace
├── name
├── description
├── settings JSONB
│   ├── resolution
│   ├── fps
│   └── aspect_ratio
├── created_by → User
├── created_at
├── updated_at
├── deleted_at

Asset
├── id
├── project_id → Project
├── uploaded_by → User
├── type: video | audio | image
├── original_url
├── status: uploading | processing | ready | failed
├── metadata JSONB
│   ├── duration_ms
│   ├── width
│   ├── height
│   ├── codec
│   ├── audio_codec
│   ├── file_size_bytes
│   └── checksum
├── created_at
├── updated_at
├── deleted_at

AssetVariant
├── id
├── asset_id → Asset
├── type: proxy | thumbnail_strip | waveform_data
├── url
├── metadata JSONB
├── created_at
```

---

### Timeline Data

```txt
Track
├── id
├── project_id → Project
├── type: video | audio
├── label
├── order_index
├── is_locked
├── is_muted
├── color
├── created_at
├── updated_at

Clip
├── id
├── project_id → Project
├── track_id → Track
├── asset_id → Asset
├── name
├── track_position_ms
├── in_point_ms
├── out_point_ms
├── duration_ms
├── transform JSONB
│   ├── x
│   ├── y
│   ├── scale
│   ├── rotation
│   └── opacity
├── version
├── created_at
├── updated_at
├── deleted_at

ClipEffect
├── id
├── clip_id → Clip
├── type: brightness | contrast | saturation | blur
├── order_index
├── params JSONB
├── enabled
├── created_at
├── updated_at

Transition
├── id
├── project_id → Project
├── from_clip_id → Clip
├── to_clip_id → Clip
├── type: dissolve | wipe_left | wipe_right | fade
├── duration_ms
├── params JSONB
├── created_at
├── updated_at

TextOverlay
├── id
├── project_id → Project
├── track_position_ms
├── duration_ms
├── content
├── font_family
├── font_size
├── font_color
├── position JSONB
├── alignment
├── background_color
├── background_opacity
├── animation: fade_in | typewriter | none
├── created_at
├── updated_at
```

---

### Exports & Jobs

```txt
ExportJob
├── id
├── project_id → Project
├── requested_by → User
├── format: mp4 | webm
├── resolution: 720p | 1080p | 4k
├── quality: draft | standard | high
├── status: queued | processing | uploading | completed | failed | cancelled
├── progress_percent
├── output_url
├── output_file_size
├── started_at
├── completed_at
├── expires_at
├── error_message
├── idempotency_key
├── created_at
├── updated_at

ProcessingJob
├── id
├── kind: extract_metadata | generate_proxy | generate_thumbnails | extract_waveform | render_export | cleanup
├── status: queued | processing | completed | failed | dead_letter
├── payload JSONB
├── attempts
├── max_attempts
├── next_run_at
├── error_message
├── idempotency_key
├── created_at
├── updated_at
```

---

### Operation Log

```txt
OperationLog
├── id UUIDv7
├── project_id → Project
├── user_id → User
├── operation_type:
│   ├── clip.add
│   ├── clip.move
│   ├── clip.trim
│   ├── clip.delete
│   ├── effect.add
│   ├── effect.update
│   ├── effect.delete
│   ├── track.update
│   └── text.update
├── payload JSONB
├── client_seq
├── server_seq
├── created_at
```

---

## 1.2 Required Indexes

ต้องมี index พร้อม comment อธิบายเหตุผล เช่น:

```sql
CREATE INDEX idx_projects_workspace_updated
ON projects (workspace_id, updated_at DESC)
WHERE deleted_at IS NULL;

-- ใช้สำหรับ list projects ภายใน workspace แบบ cursor pagination
```

ตัวอย่าง indexes ที่ควรมี:

```txt
users.email unique
workspaces.slug unique
workspace_members(workspace_id, user_id) unique
projects(workspace_id, updated_at)
assets(project_id, status)
tracks(project_id, order_index)
clips(project_id, track_id, track_position_ms)
clip_effects(clip_id, order_index)
operation_logs(project_id, created_at)
operation_logs(project_id, server_seq)
export_jobs(project_id, created_at)
export_jobs(idempotency_key) unique
processing_jobs(idempotency_key) unique
```

---

## 1.3 สิ่งที่ต้องส่ง

```txt
backend/
├── migrations/
│   ├── 0001_init.sql
│   ├── 0002_indexes.sql
│   └── 0003_seed.sql
├── src/db/
│   ├── mod.rs
│   ├── pool.rs
│   ├── models.rs
│   └── queries.rs
└── DESIGN.md
```

Seed data ต้องมีอย่างน้อย:

```txt
2 users
1 workspace
2 projects
4 tracks
5+ clips
sample effects
sample assets
sample export job
sample operation logs
```

---

## 1.4 DESIGN.md ต้องตอบ

1. ทำไมเลือก SQLx / SeaORM / raw SQL?
2. จุดไหน normalize และจุดไหน denormalize?
3. Soft delete strategy ทำอย่างไร?
4. Cascade cleanup ทำอย่างไร?
5. ทำไม clip position เก็บเป็น `track_position_ms`?
6. OperationLog จะโตเร็ว จะ archive หรือ partition อย่างไร?
7. Estimate rows สำหรับ 1,000 users × 10 projects × 30 clips
8. วิธี handle concurrent timeline updates

---

# 🔧 Task 2: Rust Backend API

## 2.1 Project Setup

```txt
backend/
├── Cargo.toml
├── .env.example
├── migrations/
├── src/
│   ├── main.rs
│   ├── app.rs
│   ├── config.rs
│   ├── error.rs
│   ├── db/
│   ├── auth/
│   ├── users/
│   ├── workspaces/
│   ├── projects/
│   ├── assets/
│   ├── timeline/
│   ├── exports/
│   ├── collaboration/
│   ├── jobs/
│   ├── storage/
│   ├── middleware/
│   └── openapi.rs
├── tests/
└── DESIGN.md
```

---

## 2.2 Required Rust Crates

แนะนำใช้ crates เหล่านี้:

```toml
[dependencies]
axum = "0.7"
tokio = { version = "1", features = ["full"] }
tower = "0.5"
tower-http = { version = "0.6", features = ["cors", "trace"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sqlx = { version = "0.8", features = ["postgres", "runtime-tokio", "uuid", "chrono", "json"] }
redis = { version = "0.27", features = ["tokio-comp"] }
uuid = { version = "1", features = ["v7", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
jsonwebtoken = "9"
argon2 = "0.5"
validator = { version = "0.18", features = ["derive"] }
utoipa = "5"
utoipa-swagger-ui = "8"
tracing = "0.1"
tracing-subscriber = "0.3"
thiserror = "2"
anyhow = "1"
reqwest = { version = "0.12", features = ["json", "multipart"] }
```

---

## 2.3 API Endpoints

### Auth

```http
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
GET    /auth/me
```

Required:

```txt
email + password register
argon2 password hashing
JWT access token
refresh token
auth extractor
```

---

### Workspaces

```http
POST   /workspaces
GET    /workspaces
GET    /workspaces/:id
POST   /workspaces/:id/invite
PATCH  /workspaces/:id/members/:userId
DELETE /workspaces/:id/members/:userId
```

Required authorization:

```txt
owner/admin can invite
owner/admin can update roles
owner can remove admin/editor/viewer
viewer cannot mutate workspace
```

---

### Projects

```http
POST   /projects
GET    /projects?workspaceId=X
GET    /projects/:id
PATCH  /projects/:id
DELETE /projects/:id
POST   /projects/:id/duplicate
GET    /projects/:id/versions
POST   /projects/:id/versions
```

Required:

```txt
cursor-based pagination
workspace permission check
project detail returns full timeline
soft delete
duplicate project with tracks, clips, effects, transitions, text overlays
```

---

### Assets

```http
POST   /assets/presigned-url
POST   /assets/confirm-upload
GET    /assets?projectId=X
GET    /assets/:id
DELETE /assets/:id
```

Upload flow:

```txt
1. Client requests presigned URL
2. Client uploads file directly to R2/S3-compatible storage
3. Client confirms upload
4. Backend creates Asset row
5. Backend enqueues processing jobs
6. Worker processes metadata/proxy/thumbnails/waveform
7. Backend notifies client through Pusher
```

---

### Timeline

```http
POST   /projects/:id/tracks
PATCH  /projects/:id/tracks/:trackId
DELETE /projects/:id/tracks/:trackId

POST   /projects/:id/clips
PATCH  /projects/:id/clips/:clipId
DELETE /projects/:id/clips/:clipId
POST   /projects/:id/clips/:clipId/split
POST   /projects/:id/clips/batch

POST   /projects/:id/clips/:clipId/effects
PATCH  /projects/:id/clips/:clipId/effects/:effectId
DELETE /projects/:id/clips/:clipId/effects/:effectId
PATCH  /projects/:id/clips/:clipId/effects/reorder

POST   /projects/:id/transitions
PATCH  /projects/:id/transitions/:transitionId
DELETE /projects/:id/transitions/:transitionId

POST   /projects/:id/text-overlays
PATCH  /projects/:id/text-overlays/:overlayId
DELETE /projects/:id/text-overlays/:overlayId
```

ทุก mutation ต้อง:

```txt
1. Validate input
2. Check project permission
3. Execute database transaction
4. Write OperationLog
5. Broadcast operation through Pusher
6. Return updated entity
```

---

### Exports

```http
POST   /projects/:id/exports
GET    /projects/:id/exports
GET    /exports/:id
DELETE /exports/:id
```

Required:

```txt
create export job
idempotency key
project validation
queue render job
progress tracking
cancel export
download URL
```

---

## 2.4 Backend Requirements

ทุก endpoint ต้องมี:

```txt
Input validation
JWT authentication
Workspace role-based authorization
Consistent error response
Cursor pagination
Rate limiting
Request ID
Tracing logs
OpenAPI docs
```

---

## 2.5 Error Handling

ใช้ typed error เช่น:

```rust
#[derive(thiserror::Error, Debug)]
pub enum AppError {
    #[error("Unauthorized")]
    Unauthorized,

    #[error("Forbidden")]
    Forbidden(String),

    #[error("Not found")]
    NotFound(String),

    #[error("Validation failed")]
    Validation(String),

    #[error("Database error")]
    Database(#[from] sqlx::Error),

    #[error("Internal server error")]
    Internal(anyhow::Error),
}
```

Response format:

```json
{
  "statusCode": 403,
  "error": "Forbidden",
  "message": "You don't have editor access to this project",
  "requestId": "req_01HX..."
}
```

---

## 2.6 Authorization Matrix

| Role   | View | Upload Asset | Edit Timeline | Export | Invite | Manage Members |
| ------ | ---: | -----------: | ------------: | -----: | -----: | -------------: |
| owner  |    ✅ |            ✅ |             ✅ |      ✅ |      ✅ |              ✅ |
| admin  |    ✅ |            ✅ |             ✅ |      ✅ |      ✅ |              ✅ |
| editor |    ✅ |            ✅ |             ✅ |      ✅ |      ❌ |              ❌ |
| viewer |    ✅ |            ❌ |             ❌ |      ❌ |      ❌ |              ❌ |

---

## 2.7 DESIGN.md ต้องตอบ

1. ทำไมเลือก Axum / Actix?
2. ทำไมเลือก SQLx / SeaORM?
3. Cursor-based pagination ทำงานอย่างไร?
4. Presigned upload flow ทำงานอย่างไร?
5. ทำไมไม่ upload file ผ่าน backend โดยตรง?
6. Batch clip operation ควร atomic transaction หรือ partial success?
7. API versioning จะจัดการอย่างไรถ้ามี breaking change?
8. Authorization layer วางไว้ที่ middleware, extractor หรือ service layer?
9. Error handling strategy เป็นอย่างไร?

---

# 🔄 Task 3: Queue & Video Processing

## 3.1 Architecture

```txt
┌─────────┐
│ Client  │
└────┬────┘
     │
     ▼
┌───────────────┐
│ Rust API      │
│ Axum / Actix  │
└────┬──────────┘
     │
     ▼
┌───────────────┐
│ Redis Streams │
│ Job Queue     │
└────┬──────────┘
     │
     ▼
┌───────────────┐
│ Rust Worker   │
│ Tokio runtime │
└────┬──────────┘
     │
     ▼
┌───────────────┐
│ ffmpeg CLI    │
└────┬──────────┘
     │
     ▼
┌───────────────┐
│ R2 / S3       │
│ PostgreSQL    │
│ Pusher        │
└───────────────┘
```

---

## 3.2 Queue Implementation Options

เลือก 1 แบบ:

```txt
Option A: Redis Streams + custom Tokio worker
Option B: Apalis + Redis backend
Option C: PostgreSQL job table + polling worker
```

ต้องอธิบายใน DESIGN.md ว่าทำไมเลือกวิธีนั้น

---

## 3.3 Required Job Types

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum JobPayload {
    ExtractMetadata {
        asset_id: Uuid,
        input_url: String,
        idempotency_key: String,
    },
    GenerateProxy {
        asset_id: Uuid,
        input_url: String,
        idempotency_key: String,
    },
    GenerateThumbnails {
        asset_id: Uuid,
        input_url: String,
        idempotency_key: String,
    },
    ExtractWaveform {
        asset_id: Uuid,
        input_url: String,
        idempotency_key: String,
    },
    RenderExport {
        export_id: Uuid,
        project_id: Uuid,
        idempotency_key: String,
    },
    CleanupExpiredFiles {
        run_id: Uuid,
    },
}
```

---

## 3.4 Asset Processing Pipeline

เมื่อ user upload video และเรียก `POST /assets/confirm-upload`:

```txt
confirm-upload
  ↓
create Asset(status = processing)
  ↓
enqueue ExtractMetadata
  ↓
worker extracts metadata
  ↓
enqueue in parallel:
  ├── GenerateProxy
  ├── GenerateThumbnails
  └── ExtractWaveform
  ↓
create AssetVariant rows
  ↓
mark Asset(status = ready)
  ↓
broadcast asset-ready to private-user-{userId}
```

---

## 3.5 ffmpeg Commands

### Extract Metadata

```bash
ffprobe \
  -v quiet \
  -print_format json \
  -show_format \
  -show_streams \
  input.mp4
```

Expected output:

```json
{
  "duration_ms": 125000,
  "width": 1920,
  "height": 1080,
  "codec": "h264",
  "audio_codec": "aac",
  "audio_channels": 2,
  "file_size_bytes": 98400000
}
```

---

### Generate Proxy

```bash
ffmpeg \
  -i input.mp4 \
  -vf scale=-2:720 \
  -c:v libx264 \
  -preset fast \
  -crf 28 \
  -c:a aac \
  -b:a 128k \
  output_proxy.mp4
```

---

### Generate Thumbnails

```bash
ffmpeg \
  -i input.mp4 \
  -vf "fps=1/5,scale=160:-1" \
  -q:v 5 \
  thumb_%03d.jpg
```

Output:

```txt
thumbnail strip image
metadata:
  interval_ms: 5000
  frame_width: 160
  frame_count: N
```

---

### Extract Waveform

```bash
ffmpeg \
  -i input.mp4 \
  -ac 1 \
  -filter:a "aformat=sample_fmts=s16" \
  -f s16le \
  output.raw
```

Worker ต้อง convert raw audio เป็น peaks array:

```json
{
  "sample_rate": 44100,
  "channels": 1,
  "peaks": [
    [-0.8, 0.7],
    [-0.5, 0.6]
  ]
}
```

---

## 3.6 Export Pipeline

เมื่อ user เรียก `POST /projects/:id/exports`:

```txt
create ExportJob(status = queued)
  ↓
enqueue RenderExport
  ↓
validate project timeline
  ↓
load clips + assets + effects
  ↓
render clip segments
  ↓
concat segments
  ↓
encode final output
  ↓
upload to R2/S3
  ↓
update ExportJob(status = completed)
  ↓
broadcast export-completed
```

---

## 3.7 Minimum Export Requirement

ต้องทำอย่างน้อย:

```txt
1. ดึง timeline data จาก PostgreSQL
2. เลือก video track หลัก
3. เรียง clips ตาม track_position_ms
4. Trim source video ตาม in_point_ms / out_point_ms
5. Concatenate clips
6. Encode เป็น MP4
7. Upload หรือ save output file
8. Update export job progress
9. Return download URL
```

---

## 3.8 Export Commands

Trim segment:

```bash
ffmpeg \
  -i input.mp4 \
  -ss 00:00:05 \
  -to 00:00:15 \
  -c:v libx264 \
  -c:a aac \
  segment_001.mp4
```

Concat:

```bash
ffmpeg \
  -f concat \
  -safe 0 \
  -i segments.txt \
  -c:v libx264 \
  -c:a aac \
  output.mp4
```

Apply simple effects:

```bash
ffmpeg \
  -i input.mp4 \
  -vf "eq=brightness=0.05:contrast=1.2:saturation=1.1" \
  output.mp4
```

---

## 3.9 Reliability Requirements

ทุก job ต้องมี:

```txt
retry 3 ครั้ง
exponential backoff
dead-letter queue
progress reporting
idempotency key
cancel support สำหรับ export
structured logs
```

Retry policy:

```txt
Attempt 1: immediate
Attempt 2: +1s
Attempt 3: +4s
Attempt 4: +16s
ถ้ายัง fail → dead_letter
```

---

## 3.10 Rate Limiting

Plan limits:

| Plan |          Uploads | Concurrent Exports |
| ---- | ---------------: | -----------------: |
| free |   5 uploads/hour |                  2 |
| pro  |  50 uploads/hour |                 10 |
| team | 200 uploads/hour |                 30 |

Implementation:

```txt
Redis counter
per-workspace key
TTL-based window
worker-side concurrency check
```

---

## 3.11 Worker Structure

```txt
worker/
├── Cargo.toml
├── src/
│   ├── main.rs
│   ├── queue.rs
│   ├── processor.rs
│   ├── ffmpeg.rs
│   ├── asset_pipeline.rs
│   ├── export_pipeline.rs
│   ├── cleanup.rs
│   ├── progress.rs
│   ├── storage.rs
│   └── error.rs
└── tests/
    ├── asset_pipeline_test.rs
    ├── export_pipeline_test.rs
    ├── retry_logic_test.rs
    └── idempotency_test.rs
```

---

## 3.12 Scheduled Cleanup

ต้องมี daily cleanup job:

```txt
1. ลบ soft-deleted projects ที่เกิน 30 วัน
2. ลบ export files ที่ expires_at < now
3. ลบ orphaned assets ที่ไม่ได้ถูกใช้เกิน 7 วัน
4. ลบ accounts ที่ deleted_at > 90 วัน
5. Log summary
```

Example summary:

```json
{
  "deleted_projects": 12,
  "deleted_assets": 89,
  "deleted_exports": 41,
  "freed_bytes": 918273645
}
```

---

## 3.13 DESIGN.md ต้องตอบ

1. ทำไมเลือก Redis Streams / Apalis / PostgreSQL job table?
2. Retry และ dead-letter queue ทำงานอย่างไร?
3. Idempotency ป้องกัน duplicate processing อย่างไร?
4. ffmpeg CLI มีข้อดีข้อเสียอะไร?
5. ถ้า video ยาว 30 นาที memory และ temp file จะจัดการอย่างไร?
6. Export job cancel ทำอย่างไร?
7. จะ scale worker หลายเครื่องอย่างไร?
8. Cost estimation สำหรับ 1 export job 1080p ความยาว 5 นาที

---

# 🔗 Task 4: Real-time Collaboration

## 4.1 Architecture

```txt
┌──────────┐
│ Client A │
└────┬─────┘
     │ mutation
     ▼
┌───────────────┐
│ Rust API      │
└────┬──────────┘
     │ save + log
     ▼
┌───────────────┐
│ PostgreSQL    │
└────┬──────────┘
     │ broadcast
     ▼
┌───────────────┐
│ Pusher        │
└────┬──────────┘
     │ event
     ▼
┌──────────┐
│ Client B │
└──────────┘
```

---

## 4.2 Channel Design

### Presence Channel

```txt
presence-project-{projectId}
```

Events:

```txt
member_added
member_removed
client-cursor-move
client-editing-clip
```

Cursor payload:

```json
{
  "userId": "user_01HX...",
  "name": "Alice",
  "currentTimeMs": 15300,
  "activeTrackId": "track_01HX...",
  "activeClipId": "clip_01HX..."
}
```

---

### Private Project Channel

```txt
private-project-{projectId}
```

Events:

```txt
operation
clip-added
clip-updated
clip-deleted
track-updated
effect-updated
transition-updated
text-overlay-updated
```

Operation payload:

```json
{
  "operationId": "op_01HX...",
  "type": "clip.move",
  "projectId": "project_01HX...",
  "userId": "user_01HX...",
  "serverSeq": 182,
  "payload": {
    "clipId": "clip_01HX...",
    "trackPositionMs": 5000
  },
  "createdAt": "2026-05-15T10:00:00Z"
}
```

---

### Private User Channel

```txt
private-user-{userId}
```

Events:

```txt
job-progress
asset-ready
export-completed
export-failed
```

---

## 4.3 Operation Sync Flow

```txt
Client A moves clip
  ↓
Client A applies optimistic update
  ↓
Client A sends PATCH /projects/:id/clips/:clipId
  ↓
Rust API validates permission
  ↓
Rust API updates database in transaction
  ↓
Rust API writes OperationLog
  ↓
Rust API broadcasts clip-updated
  ↓
Client B receives event and updates local state
  ↓
Client A receives event and reconciles optimistic state
```

---

## 4.4 Conflict Resolution

Required strategy:

```txt
Last-write-wins
server timestamp wins
server sequence wins
property-level merge when possible
```

Example:

```txt
User A moves clip position
User B changes brightness
Result: both updates can merge

User A moves clip to 5s
User B moves same clip to 8s
Result: later server_seq wins
```

Frontend ต้องแสดง toast เมื่อ remote update overwrite local state:

```txt
Another collaborator updated this clip. Your local change was synced with the server version.
```

---

## 4.5 Offline Reconnect

เมื่อ client reconnect:

```txt
1. Client keeps last_seen_server_seq
2. Client calls GET /projects/:id/operations?afterSeq=X
3. Backend returns missed operations
4. Client applies operations in order
5. Client reloads full project state if gap is too large
```

Required endpoint:

```http
GET /projects/:id/operations?afterSeq=123
```

---

## 4.6 Backend Structure

```txt
backend/src/collaboration/
├── mod.rs
├── pusher.rs
├── presence.rs
├── operation_log.rs
├── sync.rs
└── dto.rs
```

---

## 4.7 Frontend Structure

```txt
frontend/src/collaboration/
├── usePusher.ts
├── usePresence.ts
├── useOperationSync.ts
├── RemoteCursors.tsx
└── CollaboratorList.tsx
```

---

## 4.8 DESIGN.md ต้องตอบ

1. ทำไมเลือก Pusher?
2. Client events กับ server events ใช้ต่างกันอย่างไร?
3. Cursor movement ควร throttle เท่าไหร่?
4. ถ้า client offline แล้ว reconnect จะ sync state อย่างไร?
5. OperationLog ใช้แก้ปัญหา missed events อย่างไร?
6. ถ้าเกิน Pusher limit จะ migrate ไป architecture แบบไหน?
7. ทำไมไม่ implement full CRDT ใน scope นี้?
8. ถ้าจะใช้ Yjs / Automerge จะออกแบบอย่างไร?

---

# 🎨 Task 5: React Editor UI

## 5.1 Tech Stack

```txt
React 19
TypeScript strict
Vite
shadcn/ui
Tailwind CSS
Zustand
Pusher JS
Vitest
```

---

## 5.2 Layout

ใช้ `ResizablePanelGroup` จาก shadcn/ui

```tsx
<ResizablePanelGroup direction="vertical">
  <ResizablePanel>
    <ResizablePanelGroup direction="horizontal">
      <ResizablePanel defaultSize={20}>
        <AssetBrowser />
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel defaultSize={55}>
        <VideoPlayer />
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel defaultSize={25}>
        <InspectorPanel />
      </ResizablePanel>
    </ResizablePanelGroup>
  </ResizablePanel>

  <ResizableHandle />

  <ResizablePanel defaultSize={40}>
    <Timeline />
  </ResizablePanel>
</ResizablePanelGroup>
```

---

## 5.3 Timeline Editor

### Required: Tracks & Clips

ต้องทำ:

```txt
แสดง tracks เป็นแถว V1, V2, A1, A2
แสดง clips เป็น block บน track
clip position อิงตาม track_position_ms
clip width อิงตาม duration_ms
แสดงชื่อ clip
แสดง duration
track header มี lock / mute / visibility
```

---

### Required: Clip Interactions

ต้องทำ:

```txt
Drag clip ย้ายตำแหน่ง
Drag clip ข้าม track ได้
Trim ขอบซ้าย/ขวา
Split ด้วยปุ่ม S
Click select
Shift+click multi-select
Click background deselect
Delete key ลบ selected clips
Ctrl+C / Ctrl+V copy paste
```

---

### Required: Playhead

ต้องทำ:

```txt
เส้น playhead แนวตั้ง
ลาก playhead ได้
แสดง current timecode
Play แล้ว playhead เคลื่อนด้วย requestAnimationFrame
Spacebar play/pause
```

---

### Required: Zoom & Scroll

ต้องทำ:

```txt
+/- buttons
Ctrl + mouse wheel = zoom
Horizontal scroll = pan
Ctrl+0 = zoom to fit
```

---

### Required: Snap

ต้องทำ:

```txt
snap clip เข้าขอบ clip อื่น
snap to playhead
แสดง snap guide
Alt ระหว่าง drag = disable snap ชั่วคราว
```

---

### Required: Timecode Ruler

ต้องทำ:

```txt
tick marks ตาม zoom level
major ticks ทุก 1 / 5 / 10 / 30 seconds
timecode labels
```

---

### Nice to Have

```txt
thumbnail strip บน video clips
waveform บน audio clips
transition zone
marquee select
virtual scrolling
keyboard shortcuts J/K/L, I/O, Home/End
track reorder
```

---

## 5.4 Video Player

ใช้ `<video>` element ได้

### Required

```txt
โหลด proxy variant ถ้ามี
play / pause
seek bar
sync currentTime กับ timeline playhead
volume slider
mute toggle
current time / total duration
```

### Nice to Have

```txt
playback speed 0.5x, 1x, 1.5x, 2x
fullscreen
CSS filter preview จาก clip effects
switch source clip ตาม playhead position
```

Example CSS filter:

```css
filter: brightness(1.2) contrast(1.1) saturate(0.8) blur(2px);
```

---

## 5.5 Inspector Panel

เมื่อ select clip ต้องแสดง:

### Clip Info

```txt
clip name
source asset
duration
in point
out point
track
```

### Transform

```txt
X
Y
Scale
Rotation
Opacity
```

ใช้ shadcn components:

```txt
Input
Slider
Label
Card
Tabs
Button
```

การเปลี่ยนค่าต้อง:

```txt
update local state
debounced PATCH API
create undo command
broadcast operation after server save
```

---

### Effects

ต้องทำ:

```txt
แสดง list effects
Add Effect dropdown
Toggle enabled
Delete effect
Brightness slider
Contrast slider
Saturation slider
Blur slider
Reorder effects optional
```

---

## 5.6 Asset Browser

ต้องทำ:

```txt
List assets
Filter tabs: All / Video / Audio / Image
Upload button
Status badge
Thumbnail
Duration
Drag asset ไป drop บน timeline เพื่อสร้าง clip
```

Upload flow:

```txt
1. Request presigned URL
2. Upload file to storage
3. Confirm upload
4. Show processing status
5. Receive asset-ready event
6. Update asset card
```

Status badges:

```txt
uploading
processing
ready
failed
```

---

## 5.7 State Management

ใช้ Zustand อย่างน้อย 3 stores:

### Project Store

```ts
interface ProjectState {
  project: Project | null;
  tracks: Track[];
  clips: Clip[];
  effects: Record<string, ClipEffect[]>;
  transitions: Transition[];
  textOverlays: TextOverlay[];

  loadProject(id: string): Promise<void>;
  addClip(clip: NewClip): void;
  moveClip(clipId: string, positionMs: number, trackId?: string): void;
  trimClip(clipId: string, inPointMs: number, outPointMs: number): void;
  splitClip(clipId: string, atTimeMs: number): void;
  deleteClips(clipIds: string[]): void;
  addEffect(clipId: string, effect: NewEffect): void;
  updateEffect(clipId: string, effectId: string, params: unknown): void;
}
```

### UI Store

```ts
interface UIState {
  selectedClipIds: string[];
  zoomLevel: number;
  scrollPosition: number;
  activeTool: 'select' | 'blade' | 'hand';
  snapEnabled: boolean;
  panelSizes: {
    left: number;
    center: number;
    right: number;
    bottom: number;
  };

  selectClip(id: string, additive?: boolean): void;
  deselectAll(): void;
  setZoom(level: number): void;
  setScrollPosition(position: number): void;
}
```

### Playback Store

```ts
interface PlaybackState {
  currentTimeMs: number;
  isPlaying: boolean;
  playbackSpeed: number;
  volume: number;
  isMuted: boolean;

  play(): void;
  pause(): void;
  seek(timeMs: number): void;
  setSpeed(speed: number): void;
  setVolume(volume: number): void;
  toggleMute(): void;
}
```

---

## 5.8 Undo / Redo

ต้อง implement command pattern

```ts
interface Command {
  id: string;
  type: string;
  description: string;
  timestamp: number;
  execute(): void;
  undo(): void;
}

class CommandManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxHistory = 50;

  execute(command: Command): void;
  undo(): void;
  redo(): void;
  getHistory(): Command[];
  canUndo(): boolean;
  canRedo(): boolean;
}
```

Actions ที่ต้อง undo ได้:

```txt
Move clip
Trim clip
Split clip
Delete clips
Add clip
Remove clip
Add effect
Remove effect
Update effect params
Update transform
```

Keyboard:

```txt
Ctrl+Z = undo
Ctrl+Shift+Z = redo
```

UI:

```txt
Undo history panel
action name
timestamp
click history entry to jump back
```

---

## 5.9 Frontend Structure

```txt
frontend/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── components.json
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   └── EditorLayout.tsx
│   │   ├── topbar/
│   │   │   └── TopBar.tsx
│   │   ├── timeline/
│   │   │   ├── Timeline.tsx
│   │   │   ├── TimelineTrack.tsx
│   │   │   ├── TimelineClip.tsx
│   │   │   ├── TimelineRuler.tsx
│   │   │   ├── Playhead.tsx
│   │   │   └── SnapGuide.tsx
│   │   ├── player/
│   │   │   ├── VideoPlayer.tsx
│   │   │   └── PlayerControls.tsx
│   │   ├── inspector/
│   │   │   ├── InspectorPanel.tsx
│   │   │   ├── ClipInfo.tsx
│   │   │   ├── TransformEditor.tsx
│   │   │   └── EffectEditor.tsx
│   │   ├── assets/
│   │   │   ├── AssetBrowser.tsx
│   │   │   └── AssetUpload.tsx
│   │   ├── collaboration/
│   │   │   ├── RemoteCursors.tsx
│   │   │   └── CollaboratorList.tsx
│   │   └── shared/
│   │       └── UndoHistory.tsx
│   ├── state/
│   │   ├── projectStore.ts
│   │   ├── uiStore.ts
│   │   ├── playbackStore.ts
│   │   └── commands/
│   │       └── CommandManager.ts
│   ├── hooks/
│   │   ├── useDragClip.ts
│   │   ├── useTrimClip.ts
│   │   ├── useZoom.ts
│   │   ├── useSnap.ts
│   │   ├── useKeyboardShortcuts.ts
│   │   ├── usePusher.ts
│   │   └── usePresence.ts
│   ├── services/
│   │   └── api.ts
│   ├── utils/
│   │   ├── timecode.ts
│   │   └── geometry.ts
│   └── types/
│       └── index.ts
└── tests/
    ├── timecode.test.ts
    ├── commands.test.ts
    └── snap.test.ts
```

---

## 5.10 Frontend DESIGN.md ต้องตอบ

1. ทำไมเลือก DOM-based timeline หรือ Canvas 2D?
2. State แยก project / UI / playback อย่างไร?
3. Undo/redo command pattern ทำงานอย่างไร?
4. Optimistic update กับ server reconciliation ทำอย่างไร?
5. Timeline zoom/snap คำนวณอย่างไร?
6. ถ้า project มี 10,000 clips จะ optimize rendering อย่างไร?
7. Pusher operation sync เข้ากับ Zustand อย่างไร?

---

# 🧪 Testing Requirements

ต้องมี tests อย่างน้อย:

## Backend

```txt
1 API endpoint integration test
auth middleware test
permission check test
```

## Worker

```txt
1 job processor test
retry logic test
idempotency test
```

## Frontend

```txt
timecode util test
command manager test
snap logic test
```

## Optional E2E

```txt
Playwright:
1. login
2. open project
3. upload asset
4. drag asset to timeline
5. move clip
6. export video
7. verify export completed
```

---

# 📊 Dynamic Scoring

## คะแนนรวม

| Task                      | Weight |
| ------------------------- | -----: |
| Database Schema           |    15% |
| Rust Backend API          |    20% |
| Queue & ffmpeg Processing |    25% |
| Collaboration             |    15% |
| React Editor UI           |    25% |

---

## Database Schema — 15%

| Level     | Score | Criteria                                                                         |
| --------- | ----: | -------------------------------------------------------------------------------- |
| Basic     |   40% | schema ครบ, relationships ถูก, migration run ได้                                 |
| Good      |   70% | indexes ดี, seed data ครบ, soft delete ชัดเจน                                    |
| Excellent |  100% | DESIGN.md ลึก, storage estimation, partition strategy, concurrent editing design |

---

## Rust Backend API — 20%

| Level     | Score | Criteria                                                                     |
| --------- | ----: | ---------------------------------------------------------------------------- |
| Basic     |   40% | CRUD projects + clips, auth, validation, app start ได้                       |
| Good      |   70% | asset upload flow, export trigger, authorization, error handling, pagination |
| Excellent |  100% | OpenAPI, tests, rate limiting, batch operations, DESIGN.md ชัดเจน            |

---

## Queue & ffmpeg — 25%

| Level     | Score | Criteria                                                                 |
| --------- | ----: | ------------------------------------------------------------------------ |
| Basic     |   40% | queue setup ทำงาน, 1 ffmpeg job จริง, progress tracking                  |
| Good      |   70% | metadata → proxy → thumbnails pipeline, retry, basic export              |
| Excellent |  100% | effects, idempotency, cancel support, cleanup jobs, tests, DESIGN.md ลึก |

---

## Collaboration — 15%

| Level     | Score | Criteria                                                                        |
| --------- | ----: | ------------------------------------------------------------------------------- |
| Basic     |   40% | Pusher connected, presence channel ทำงาน                                        |
| Good      |   70% | remote cursors, operation broadcast, collaborator list                          |
| Excellent |  100% | conflict handling, offline reconnect sync, optimistic updates, DESIGN.md ชัดเจน |

---

## React Editor UI — 25%

| Level     | Score | Criteria                                                                                               |
| --------- | ----: | ------------------------------------------------------------------------------------------------------ |
| Basic     |   40% | timeline แสดง tracks/clips, drag, playhead, select/delete                                              |
| Good      |   70% | trim, split, zoom, snap, inspector, asset browser, undo/redo                                           |
| Excellent |  100% | thumbnails/waveform, keyboard shortcuts, CSS filter preview, virtual scrolling, clean state management |

---

# 🏆 Bonus Points

| Bonus                            | Extra |
| -------------------------------- | ----: |
| Docker Compose                   |   +3% |
| GitHub Actions CI                |   +2% |
| Playwright E2E                   |   +3% |
| Multi-track export               |   +5% |
| Text overlay rendering           |   +3% |
| CRDT with Yjs / Automerge        |   +5% |
| Observability: tracing + metrics |   +2% |
| Dark mode                        |   +1% |
| Tablet responsive editor         |   +2% |

---

# ⚠️ Rules

1. Rust code ต้อง compile ผ่าน `cargo build`
2. Backend ต้อง run ได้ด้วย `cargo run -p backend`
3. Worker ต้อง run ได้ด้วย `cargo run -p worker`
4. Database migrations ต้อง run ได้จริง
5. API ต้องมี auth, validation, authorization และ error handling
6. ffmpeg ต้อง process จริง ไม่ใช่ mock delay
7. React ต้องใช้ TypeScript strict
8. shadcn/ui เป็น UI หลัก
9. ห้ามใช้ Material UI, Ant Design หรือ UI framework อื่น
10. ต้องมี tests ตาม minimum requirements
11. ต้องมี README.md
12. ต้องมี DESIGN.md สำหรับ backend, worker และ frontend
13. ต้องมี `.env.example`
14. ต้องมี demo video หรือ screenshots

---

# 📁 Final Repo Structure

```txt
cloudcut/
├── README.md
├── docker-compose.yml
├── .env.example
├── Cargo.toml
│
├── backend/
│   ├── Cargo.toml
│   ├── migrations/
│   │   ├── 0001_init.sql
│   │   ├── 0002_indexes.sql
│   │   └── 0003_seed.sql
│   ├── src/
│   │   ├── main.rs
│   │   ├── app.rs
│   │   ├── config.rs
│   │   ├── error.rs
│   │   ├── openapi.rs
│   │   ├── db/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── workspaces/
│   │   ├── projects/
│   │   ├── assets/
│   │   ├── timeline/
│   │   ├── exports/
│   │   ├── collaboration/
│   │   ├── jobs/
│   │   ├── storage/
│   │   └── middleware/
│   ├── tests/
│   └── DESIGN.md
│
├── worker/
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs
│   │   ├── queue.rs
│   │   ├── processor.rs
│   │   ├── ffmpeg.rs
│   │   ├── asset_pipeline.rs
│   │   ├── export_pipeline.rs
│   │   ├── cleanup.rs
│   │   ├── progress.rs
│   │   ├── storage.rs
│   │   └── error.rs
│   ├── tests/
│   └── DESIGN.md
│
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── components.json
│   ├── src/
│   ├── tests/
│   └── DESIGN.md
│
└── docs/
    ├── architecture.md
    ├── api-spec.md
    └── database-design.md
```

---

# README.md ต้องมี

```txt
Project overview
Tech stack
Setup instructions
Environment variables
Database migration command
Backend run command
Worker run command
Frontend run command
Architecture diagram
API documentation link
Screenshots or demo video
Known limitations
Future improvements
```

---

# Expected Commands

```bash
docker compose up -d postgres redis

cargo sqlx migrate run

cargo run -p backend

cargo run -p worker

cd frontend
pnpm install
pnpm dev
```

---

# Definition of Done

ถือว่าส่งงานสมบูรณ์เมื่อ:

```txt
1. เปิด frontend ได้
2. login ได้
3. เปิด project ได้
4. timeline แสดง tracks และ clips ได้
5. drag / trim / split clip ได้อย่างน้อยบางส่วน
6. upload asset แล้ว backend สร้าง job ได้
7. worker เรียก ffmpeg จริงได้
8. export video พื้นฐานได้
9. Pusher presence หรือ operation sync ทำงานได้
10. tests ผ่าน
11. README และ DESIGN.md ครบ
```
