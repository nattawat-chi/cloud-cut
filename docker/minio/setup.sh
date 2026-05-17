#!/bin/sh
# =============================================================================
# CloudCut MinIO bootstrap.
# Idempotent — safe to re-run on every `docker compose up`.
# Creates the `cloudcut-assets` bucket and grants anonymous download to the
# /variants/ prefix (where proxy MP4s and thumbnail strips live).
# =============================================================================
set -e

ALIAS="local"
BUCKET="cloudcut-assets"

echo "[minio-setup] waiting for MinIO to accept logins..."
until mc alias set "$ALIAS" http://minio:9000 cloudcut cloudcut_dev_secret >/dev/null 2>&1; do
  sleep 1
done

echo "[minio-setup] ensuring bucket '$BUCKET' exists..."
mc mb --ignore-existing "$ALIAS/$BUCKET" >/dev/null

echo "[minio-setup] enabling anonymous download on /variants/* ..."
# Proxy/thumbnail variants need to be reachable from <video> tags without auth.
# Originals stay private and are served via presigned URLs from the backend.
mc anonymous set download "$ALIAS/$BUCKET" >/dev/null 2>&1 || true

echo "[minio-setup] done."
