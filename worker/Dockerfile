# syntax=docker/dockerfile:1.7
# =============================================================================
# CloudCut worker — production multi-stage build.
# Runtime image bundles ffmpeg (Rule 6: ffmpeg must process for real).
# =============================================================================

# ---- Builder ---------------------------------------------------------------
FROM rust:1.83-slim-bookworm AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        pkg-config libssl-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock* ./
COPY backend/Cargo.toml backend/
COPY worker/Cargo.toml worker/

RUN mkdir -p backend/src worker/src \
    && echo 'fn main() {}' > backend/src/main.rs \
    && echo 'fn main() {}' > worker/src/main.rs \
    && cargo build --release -p worker \
    && rm -rf backend/src worker/src

COPY backend backend
COPY worker worker
RUN touch worker/src/main.rs && cargo build --release -p worker

# ---- Runtime ---------------------------------------------------------------
FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates libssl3 ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 1001 --create-home --shell /usr/sbin/nologin cloudcut

WORKDIR /app
COPY --from=builder /app/target/release/worker /usr/local/bin/worker

USER cloudcut
CMD ["worker"]
