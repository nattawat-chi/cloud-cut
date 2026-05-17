-- =============================================================================
-- CloudCut Postgres — first-boot extension setup.
-- Runs once when the data volume is fresh. Migrations under backend/migrations
-- take over for schema / seed.
-- =============================================================================

-- pgcrypto: provides gen_random_uuid() for UUIDv4 defaults if we need them.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- uuid-ossp: legacy fallback (uuid_generate_v4). UUIDv7 is generated app-side
-- via the `uuid` crate (Rule: schema uses UUIDv7 for sortable PKs).
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- citext: case-insensitive text — used for the users.email column so we can
-- enforce uniqueness without lower(email) indexes.
CREATE EXTENSION IF NOT EXISTS "citext";
