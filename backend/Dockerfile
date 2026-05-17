# syntax=docker/dockerfile:1.7
# =============================================================================
# CloudCut backend — production multi-stage build.
#
# Layer 1 (builder): full Rust toolchain, compiles the release binary.
# Layer 2 (runtime): tiny debian-slim with just ca-certificates + libssl.
# Final image lands around 80–120 MB instead of ~2 GB.
# =============================================================================

# ---- Builder ---------------------------------------------------------------
FROM rust:1.83-slim-bookworm AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        pkg-config libssl-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy workspace manifests first so cargo can cache dependency builds.
COPY Cargo.toml Cargo.lock* ./
COPY backend/Cargo.toml backend/
COPY worker/Cargo.toml worker/

# Dummy sources prime the dependency cache.
RUN mkdir -p backend/src worker/src \
    && echo 'fn main() {}' > backend/src/main.rs \
    && echo 'fn main() {}' > worker/src/main.rs \
    && cargo build --release -p backend \
    && rm -rf backend/src worker/src

# Now copy real sources and rebuild only what changed.
COPY backend backend
COPY worker worker
RUN touch backend/src/main.rs && cargo build --release -p backend

# ---- Runtime ---------------------------------------------------------------
FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 1001 --create-home --shell /usr/sbin/nologin cloudcut

WORKDIR /app
COPY --from=builder /app/target/release/backend /usr/local/bin/backend

USER cloudcut
EXPOSE 8080
CMD ["backend"]
