# Notionless web app — self-host image.
#
# Multi-stage: build the static web bundle with the SAME renderer code the
# desktop app ships (vite.web.config.mjs over an IndexedDB-backed mock window.api),
# then serve it with Caddy. Caddy is chosen over nginx for ONE reason: a custom
# domain like `docs.yourcompany.com` gets automatic, auto-renewing HTTPS from
# Let's Encrypt with zero cert config — you set the domain and that's it.
#
# Build context is the REPO ROOT (compose passes `context: .`,
# `dockerfile: src/renderer/web/Dockerfile`).

# ---- stage 1: build the static bundle ----
FROM node:20-alpine AS build
WORKDIR /app
# pnpm via corepack, pinned to the repo's packageManager.
RUN corepack enable && corepack prepare pnpm@10.27.0 --activate
# Lockfile-only install first for layer caching.
COPY package.json pnpm-lock.yaml ./
# --frozen-lockfile fails loudly if the lockfile drifted; matches CI.
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build:web
# Inject the runtime-config loader so the entrypoint can hand the SPA its
# self-host settings (relay URL, accounts toggle, …) WITHOUT a rebuild. config.js
# reads window.__NL_CONFIG first; nlconfig.js is written fresh at container start.
RUN sed -i 's#<head>#<head><script src="/nlconfig.js"></script>#' /app/dist-web/index.html

# ---- stage 2: serve ----
FROM caddy:2-alpine
# Static bundle.
COPY --from=build /app/dist-web /srv
# Reverse-proxy + static-serve + auto-HTTPS config.
COPY src/renderer/web/Caddyfile /etc/caddy/Caddyfile
# Entrypoint writes /srv/nlconfig.js from env, then runs Caddy.
COPY src/renderer/web/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
# Where the relay (signaling + /api + optional /yjs) lives. Defaults to the
# compose service name; override for a relay on another host.
ENV NL_RELAY_UPSTREAM=relay:9008
# The public address Caddy answers on. `:80` = plain HTTP (local/dev). Set to a
# hostname (docs.example.com) and Caddy auto-provisions Let's Encrypt HTTPS.
ENV NL_DOMAIN=:80
EXPOSE 80 443
ENTRYPOINT ["docker-entrypoint.sh"]
