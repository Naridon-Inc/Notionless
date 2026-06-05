#!/bin/sh
# Write the SPA's runtime config from env, then hand off to Caddy.
#
# config.js (src/renderer/src/config.js) reads window.__NL_CONFIG FIRST, so this
# lets a self-hoster change the relay URL, accounts toggle, download link, etc.
# by editing env + restarting — no rebuild. Only keys that are actually set are
# emitted, so unset keys fall through to config.js's own resolution (same-origin
# relay, official defaults).

set -e
CONFIG_FILE=/srv/nlconfig.js

{
  echo "// Generated at container start from env — do not edit."
  echo "window.__NL_CONFIG = {"
  [ -n "$NL_SIGNALING_URL" ]  && printf '  SIGNALING_URL: %s,\n'   "$(printf '%s' "$NL_SIGNALING_URL"  | sed 's/"/\\"/g; s/^/"/; s/$/"/')"
  [ -n "$NL_CLOUD_SYNC_URL" ] && printf '  CLOUD_SYNC_URL: %s,\n'  "$(printf '%s' "$NL_CLOUD_SYNC_URL" | sed 's/"/\\"/g; s/^/"/; s/$/"/')"
  [ -n "$NL_DOWNLOAD_URL" ]   && printf '  DOWNLOAD_URL: %s,\n'    "$(printf '%s' "$NL_DOWNLOAD_URL"   | sed 's/"/\\"/g; s/^/"/; s/$/"/')"
  [ -n "$NL_API_URL" ]        && printf '  API_URL: %s,\n'         "$(printf '%s' "$NL_API_URL"        | sed 's/"/\\"/g; s/^/"/; s/$/"/')"
  [ -n "$NL_APP_DEEP_LINK" ]  && printf '  APP_DEEP_LINK: %s,\n'   "$(printf '%s' "$NL_APP_DEEP_LINK"  | sed 's/"/\\"/g; s/^/"/; s/$/"/')"
  [ -n "$NL_ACCOUNTS" ]       && printf '  ACCOUNTS: %s,\n'        "$(printf '%s' "$NL_ACCOUNTS"       | sed 's/"/\\"/g; s/^/"/; s/$/"/')"
  echo "};"
} > "$CONFIG_FILE"

# ACME account email snippet (imported by the Caddyfile global block). Only emit
# the `email` directive when set — an empty directive would fail Caddy parsing.
if [ -n "$NL_TLS_EMAIL" ]; then
  echo "email $NL_TLS_EMAIL" > /etc/caddy/email.conf
else
  echo "# no NL_TLS_EMAIL set" > /etc/caddy/email.conf
fi

echo "[notionless-web] wrote runtime config -> $CONFIG_FILE"
echo "[notionless-web] serving on ${NL_DOMAIN:-:80}, relay upstream ${NL_RELAY_UPSTREAM:-relay:9008}"

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
