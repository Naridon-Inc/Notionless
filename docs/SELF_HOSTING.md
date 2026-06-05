# Self-host Notionless (your own web app, your own domain)

Notionless is local-first and works with **no server at all** — the desktop app
syncs peer-to-peer, end-to-end encrypted, and the only thing we host is a tiny
stateless relay. But you can run **the whole thing yourself**: the web app *and*
the relay, on your own box, at your own domain like `docs.yourcompany.com`, with
**one command**. Optionally put a company sign-in in front of it.

No database to set up. No accounts system to build. No cloud lock-in.

> Just want notes available 24/7 (no web app, no login)? That's the simpler
> "always-on sync box" — see **[SELF_HOSTED_SYNC.md](./SELF_HOSTED_SYNC.md)**.
> This guide is for hosting the full **web app** on your own domain.

---

## TL;DR

```bash
git clone https://github.com/Naridon-Inc/notionless.git
cd notionless
cp .env.selfhost.example .env
#   edit .env → set NL_DOMAIN=docs.yourcompany.com  (and NL_TLS_EMAIL)
docker compose -f docker-compose.selfhost.yml up -d
```

Point a DNS **A record** for `docs.yourcompany.com` at the box. Open
`https://docs.yourcompany.com`. Done — HTTPS is automatic.

---

## Choose your mode (one switch)

The bundle runs in one of two modes, set by **`NL_MODE`** in `.env`. Both keep the
same end-to-end encryption — the difference is only *where availability comes from*.

| | `NL_MODE=online` *(default)* | `NL_MODE=p2p` |
|---|---|---|
| **What your team gets** | A **full online Notion**: a web app on your domain, usable from any browser, with docs synced across **web + desktop + mobile** | A **pure relay** — your devices/apps sync **directly peer-to-peer** |
| **The box** | Stores every note **encrypted**, serves it **24/7**, and relays **realtime collab** even when no one's online | Brokers connections only — **stores nothing** |
| **Availability** | Always on | Whenever ≥1 device/teammate is online |
| **Privacy** | Ciphertext only — the box can never read a note | Nothing ever lands on the box |

That's the whole choice. `online` is the default because it's what most people want
from "host my own Notion." Set `NL_MODE=p2p` if you only want an always-available
*relay* and prefer notes to live solely on members' devices. Either way it's **your**
box — Naridon hosts nothing of yours.

> Individual members can also opt their **own** client back to pure P2P at runtime
> (without changing the server) from inside the app — click the small sync dot next
> to a teamspace in the sidebar.

---

## Don't want to touch a terminal? Ask an AI agent

Paste this prompt into **Claude Code** (or Cursor, Codex, or any coding agent)
running on your server or laptop. It clones, configures, launches, and hands you a
URL — asking you for your domain along the way:

```text
Set up Notionless (https://github.com/Naridon-Inc/Notionless) on this machine — a
self-hosted, end-to-end-encrypted, local-first Notion alternative. Steps:

1. Make sure Docker + Docker Compose are installed and running (install if needed).
2. Clone the repo if it isn't already here, then cd into it.
3. Copy .env.selfhost.example to .env. Ask me for my domain (e.g. docs.example.com)
   and my email, and set NL_DOMAIN and NL_TLS_EMAIL in .env. If I say I just want to
   try it locally, set NL_DOMAIN=:80 instead and skip the email.
4. Run: docker compose -f docker-compose.selfhost.yml up -d
5. Wait until the containers are healthy, curl /health to confirm, then tell me the
   exact URL to open. If I gave a real domain, remind me to point a DNS A record at
   this server's public IP and to open ports 80 and 443.
6. If I later say I want a company login, set NL_ACCOUNTS=1 in .env and restart.

Explain each step briefly as you go, and confirm with me before anything destructive.
```

Everything below is the same flow, done by hand, plus the full settings reference.

---

## What you get

Two small containers, defined in `docker-compose.selfhost.yml`:

- **`web`** — the same app the desktop ships, served by **Caddy**. Caddy also
  reverse-proxies the relay, so the app and its sync live on **one origin** (no
  CORS, no second hostname). Point it at a real domain and it fetches + renews a
  **Let's Encrypt HTTPS certificate automatically** — you configure nothing.
- **`relay`** — the stateless WebRTC signaling relay (+ optional always-on
  encrypted sync, + optional accounts). It stores only ciphertext and hashed room
  names; it can never read your notes.

That's the whole system. No Postgres, no Redis, no message queue.

---

## Deploy it your way (platform guides)

There are exactly **two pieces**, and you can host each one wherever you like:

![Self-hosting architecture — the static web app deploys to any CDN; the relay needs a host that runs a persistent WebSocket process](./images/self-host-architecture.svg)

| Piece | What it is | Needs | Where it can run |
|---|---|---|---|
| **Web app** | Static HTML/JS/CSS — the UI | A static file host | Docker · Vercel · Netlify · Cloudflare Pages · GitHub Pages |
| **Relay** | WebSocket service (signaling + optional encrypted sync) | A long-running process | Docker · Fly.io · Railway · Render · any VPS |

**The one rule:** the relay holds a WebSocket open, so it **cannot** run on a
serverless platform (Vercel/Netlify functions). Host the *web app* there if you
like, but the *relay* needs a real process. The two easiest shapes:

- **One box does both** → [Docker Compose](#option-1--docker-compose-both-pieces-recommended) (recommended).
- **Split** → static web app on a CDN + relay on Fly/Railway/Render.

> **Heads-up about the relay URL.** A static web app served from `app.vercel.app`
> has no relay at its own origin, so you must tell it where the relay is with the
> **`VITE_SIGNALING_URL`** build-time env var (e.g.
> `wss://your-relay.fly.dev/signaling`, or `wss://oss.naridon.com/signaling` to use
> the public relay). The Docker Compose bundle doesn't need this — the relay lives
> at the same origin.

### Option 1 — Docker Compose (both pieces) ✅ recommended

The rest of this guide. One command brings up the web app + relay with automatic
HTTPS on your domain. Jump to [TL;DR](#tldr).

### Option 2 — Web app on Vercel

A `vercel.json` is committed at the repo root (build `pnpm run build:web`, output
`dist-web`, SPA rewrites), so it's import-and-go.

1. **Import** the repo at [vercel.com/new](https://vercel.com/new) (Framework
   preset: **Other** — the `vercel.json` handles the rest).
2. **Add an env var** → `VITE_SIGNALING_URL = wss://<your-relay>/signaling`
   (your own relay from Option 5–8, or `wss://oss.naridon.com/signaling`).
   Optionally `VITE_CLOUD_SYNC_URL = wss://<your-relay>/yjs` for always-on sync.
3. **Deploy.** Add your custom domain in **Settings → Domains**; Vercel handles TLS.

One-click: `https://vercel.com/new/clone?repository-url=https://github.com/Naridon-Inc/Notionless&env=VITE_SIGNALING_URL`

### Option 3 — Web app on Netlify

A `netlify.toml` is committed (build, publish dir, SPA redirect).

1. **Add new site → Import an existing project**, pick the repo.
2. Build settings auto-fill from `netlify.toml`. Under **Site settings →
   Environment variables**, set `VITE_SIGNALING_URL` (and optionally
   `VITE_CLOUD_SYNC_URL`).
3. **Deploy**, then add your domain under **Domain management** (free auto-TLS).

### Option 4 — Web app on Cloudflare Pages (or GitHub Pages)

**Cloudflare Pages:** Create a project from the repo with:

- **Build command:** `pnpm run build:web`
- **Output directory:** `dist-web`
- **Environment variable:** `VITE_SIGNALING_URL = wss://<your-relay>/signaling`

For SPA routing, add a `_redirects` file containing `/* /index.html 200` (Pages
serves real files first, falls back to `index.html`).

**GitHub Pages:** build locally or in CI with
`VITE_PUBLIC_BASE="/<repo>/" VITE_SIGNALING_URL="wss://<relay>/signaling" pnpm run build:web`
and publish `dist-web/` to the `gh-pages` branch. (Set `VITE_PUBLIC_BASE` because
Pages serves from a subpath.)

### Option 5 — Relay on Fly.io

The relay lives in `backend/` with a committed `fly.toml`:

```bash
cd backend
fly launch --copy-config      # accepts backend/fly.toml
fly deploy
```

Your relay is now at `wss://<app-name>.fly.dev/signaling`. The relay reads
`$PORT`/defaults to 9008 and `fly.toml` keeps one machine always running (a relay
shouldn't sleep). Point the web app's `VITE_SIGNALING_URL` at it.

### Option 6 — Relay on Railway

1. **New Project → Deploy from GitHub repo.**
2. Set the **service root** to `backend/` (Railway uses `backend/Dockerfile`).
3. Railway injects `$PORT`; add `RELAY_ONLY=true` (and optionally
   `ALLOWED_ORIGINS=https://your-web-app.example.com`).
4. Use the generated domain as `wss://<app>.up.railway.app/signaling`.

### Option 7 — Relay on Render

A `render.yaml` Blueprint is committed:

1. **New → Blueprint**, pick this repo; Render reads `render.yaml`
   (Docker, `backend/Dockerfile`, health check `/health`).
2. Deploy. Your relay is at `wss://<service>.onrender.com/signaling`.

> Render's free tier sleeps when idle, which drops the WebSocket. Use a paid
> instance (or keep ≥1 peer connected) for reliable always-on sync.

### Option 8 — Relay on a plain VPS

```bash
git clone https://github.com/Naridon-Inc/Notionless.git
cd Notionless/backend
npm install
RELAY_ONLY=true PORT=9008 npm start
```

Put it behind your own TLS (Caddy/nginx) on `wss://relay.yourcompany.com/signaling`
and set `ALLOWED_ORIGINS` to your web app's origin. (Or just use Option 1, which
does the web app, the relay, and TLS together.)

### Which combo should I pick?

- **Just want it working** → Option 1 (Docker Compose). Both pieces, one domain,
  auto-HTTPS, done.
- **Already on Vercel/Netlify and want a CDN-fast UI** → Option 2/3 for the web app
  + Option 5 (Fly) for the relay.
- **Don't want to host the relay at all** → Option 2/3/4 for the web app and point
  `VITE_SIGNALING_URL` at `wss://oss.naridon.com/signaling` (the free public relay).

---

## Custom domain + automatic HTTPS

Set one line in `.env`:

```bash
NL_DOMAIN=docs.yourcompany.com
NL_TLS_EMAIL=you@yourcompany.com   # for cert-expiry notices (recommended)
```

Point DNS at the box, open ports **80 and 443**, and `docker compose up`. On the
first request Caddy provisions a certificate for your domain and serves the app
over HTTPS, renewing on its own forever. Subdomains work exactly the same —
`docs.`, `notes.`, `wiki.`, whatever you like.

The app auto-detects that it's running on your domain and points sync at
`wss://docs.yourcompany.com/signaling` — **no relay URL to configure**.

**Local test (no domain):** leave `NL_DOMAIN=:80` and open `http://localhost`.
Plain HTTP, no certificate, good for kicking the tires.

---

## Optional: a company sign-in (accounts)

By default there are **no accounts** — anyone who reaches the page can use it
(content is still E2EE and you still need a team link + password to read any
note). If you'd rather gate the instance to your team, turn accounts on:

```bash
NL_ACCOUNTS=1
NL_ACCOUNTS_SIGNUP=open                  # or "closed" (admin-added users only)
NL_ACCOUNTS_SECRET=<openssl rand -hex 32>  # so logins survive restarts
```

Now the web app shows an email/password screen first. **The first account created
becomes the admin.** With `open` signup, teammates self-serve; with `closed`,
only the admin account is self-served and others are added by the admin.

### The honest constraint (important)

A server account here is an **access gate, not a key.** Because notes are
end-to-end encrypted, **no server account can ever decrypt your content** — the
decryption key is derived on your device from the *team* password and never
reaches the box. So "accounts" buy you a familiar company-login wall and a record
of who may use the instance; they do **not** weaken (or strengthen) the privacy
of the notes themselves. After signing in, you still join teams with the team
link + password exactly as in the zero-account flow.

Want to also reject *unauthenticated sync* (a strictly members-only relay)? Add
`NL_ACCOUNTS_STRICT=1`. Leave it off if desktop teammates connect to this relay
without signing in through the web app.

---

## Always-on sync (notes available 24/7)

On by default in this bundle (`NL_MODE=online`): the relay keeps each note's
**encrypted** state in a Docker volume, so notes are available even when every
laptop is closed. To run **pure peer-to-peer** instead (the box stores nothing),
flip the one switch:

```bash
NL_MODE=p2p
```

That's all — `NL_MODE` drives both the relay (stop persisting) and the web app
(stop mirroring). The `NL_PERSIST_DIR` / `NL_CLOUD_SYNC_URL` knobs below are
advanced overrides you normally leave blank; set them only for non-standard layouts
(e.g. pointing the web app at a *different* box). The privacy story is identical
either way — the box only ever holds ciphertext. Deep dive:
**[SELF_HOSTED_SYNC.md](./SELF_HOSTED_SYNC.md)**.

---

## Connecting the desktop app to your relay

The desktop app defaults to the official relay. To point a build at yours, set the
signaling URL at build time:

```bash
VITE_SIGNALING_URL="wss://docs.yourcompany.com/signaling" pnpm run dist
```

(Or distribute the web app — `https://docs.yourcompany.com` — which needs no
install and is already wired to your relay.)

---

## Settings reference

Everything is driven by `.env` (copied from `.env.selfhost.example`):

| Variable | Default | What it does |
|---|---|---|
| `NL_MODE` | `online` | **The one switch.** `online` = full online app (24/7 encrypted storage + realtime sync). `p2p` = pure relay that stores nothing. Drives both services. |
| `NL_DOMAIN` | `:80` | Your public hostname → automatic HTTPS. `:80` = local HTTP. |
| `NL_TLS_EMAIL` | _(unset)_ | Let's Encrypt account email (cert-expiry notices). |
| `NL_PERSIST_DIR` | _(unset → `/data` in online mode)_ | Advanced: relay's encrypted-state folder. Leave blank; `NL_MODE` sets it. |
| `NL_CLOUD_SYNC_URL` | _(unset → `/yjs` in online mode)_ | Advanced: where clients mirror. Leave blank; set only to point at a different box. |
| `NL_ACCOUNTS` | _(off)_ | `1` shows the email/password sign-in gate. |
| `NL_ACCOUNTS_SIGNUP` | `open` | `open` (self-serve) or `closed` (admin-added). |
| `NL_ACCOUNTS_STRICT` | _(off)_ | `1` also rejects unauthenticated sync. |
| `NL_ACCOUNTS_SECRET` | random | Session-signing secret; set it so logins survive restarts. |
| `NL_DOWNLOAD_URL` | official release | Where the in-app "Download desktop app" buttons point. |
| `NL_ALLOWED_ORIGINS` | _(none)_ | Extra web origins allowed to call the relay API. |

---

## Operating it

- **Health check:** `curl https://docs.yourcompany.com/health` → `{"status":"ok"}`.
- **Update:** `git pull && docker compose -f docker-compose.selfhost.yml up -d --build`.
- **Back up:** the `notionless-data` volume (encrypted notes, accounts, analytics)
  and `caddy-data` (your TLS certs). Every teammate also keeps a full local copy,
  so a lost box is an inconvenience, not a catastrophe.
- **Logs:** `docker compose -f docker-compose.selfhost.yml logs -f`.

---

## Is it still private? Yes.

- Notes are **encrypted on your device before they leave**. The relay stores only
  scrambled ciphertext in files named after a one-way hash.
- Encryption keys come from your **team link + password**, which **never reach the
  box**. Steal the whole disk and you get noise.
- Accounts (if enabled) gate *access to the instance*, never the *contents* of
  notes — that's a hard property of the end-to-end encryption, not a setting.

Set `NL_MODE=p2p` (and leave `NL_ACCOUNTS` unset) and you're back to pure,
serverless, end-to-end-encrypted peer-to-peer — just with the relay hosted on your
own domain.
