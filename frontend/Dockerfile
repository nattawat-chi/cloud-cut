# syntax=docker/dockerfile:1.7
# =============================================================================
# CloudCut frontend — production build.
# Stage 1: Vite build with pnpm.
# Stage 2: nginx serves the static bundle.
# =============================================================================

# ---- Builder ---------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

COPY . .
RUN pnpm build

# ---- Runtime ---------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime
# SPA fallback — every unknown route hands index.html to the React router.
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { try_files $uri $uri/ /index.html; } \
}' > /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
