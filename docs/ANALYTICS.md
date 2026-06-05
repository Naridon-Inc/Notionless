# Site analytics (first-party, privacy-respecting)

How we measure the **marketing page** (oss.naridon.com) — pageviews, referrers
(Product Hunt / HN / Reddit), and download clicks — without betraying the
product's privacy stance. This is **not** third-party tracking and it never
touches notes, keys, or identity.

## What it is

A tiny self-hosted analytics path built into the relay:

- **Client** — `landing/analytics.js` (~1 KB, no deps). On page load it sends one
  anonymous beacon; it also reports outbound CTA clicks (download, GitHub).
- **Collector** — `POST /api/collect` in the relay (`backend/src/index.js`),
  storing to `backend/src/analytics.js`.
- **Dashboard** — `stats.html` (served at `/stats.html`) reads the aggregate
  `GET /api/stats` (token-gated).

## Privacy design (why it's defensible on a privacy product)

- **No cookies, no localStorage, no cross-site IDs, no fingerprinting.**
- **Raw IP is never stored.** A visitor is counted via
  `SHA-256(daily-rotating salt + IP + user-agent)`, truncated. The salt is
  `H(server-secret + UTC day)` — it rotates every day and is never written to
  disk, so the hash can't be reversed to an IP nor correlated across days into a
  persistent profile (the Plausible approach).
- **Only non-PII signals**: path, referrer host, UTM tags, coarse browser/OS,
  screen/viewport size, language, timezone.
- **Honors Do Not Track** — the client sends nothing when `DNT=1`, and a visitor
  can hard opt-out with `localStorage['nl-analytics-opt-out'] = '1'`.
- **Bots excluded** from the dashboard by default.
- **Aggregate-only readout**; append-only per-day NDJSON on local disk.
- Fully disableable: `ANALYTICS_DISABLE=true` makes both endpoints return 404.

The P2P relay still stores nothing about your notes/keys — this is opt-out
marketing-site analytics only, and it's the same self-hosted spirit as the rest
of the stack.

## Configure (relay env — see `backend/.env.example`)

| Var | Default | Meaning |
|-----|---------|---------|
| `ANALYTICS_TOKEN` | _(unset)_ | Token to read `/api/stats`. If unset, only localhost may read. `openssl rand -hex 24`. |
| `ANALYTICS_DIR` | `backend/.analytics` | Where per-day event files live. Point at a persistent disk in prod. |
| `ANALYTICS_SALT` | `ANALYTICS_TOKEN` → random | Base secret for the daily visitor-hash salt (keeps unique counts stable across restarts). |
| `ANALYTICS_DISABLE` | `false` | `true` disables collection + endpoints. |

> The data dir is gitignored (`backend/.analytics/`). On Lightsail, set
> `ANALYTICS_DIR` to a mounted volume so it survives redeploys.

## How to check the numbers

1. Set `ANALYTICS_TOKEN` on the relay and redeploy.
2. Open **`https://oss.naridon.com/stats.html`**, paste the token, pick a range.
   - Cards: pageviews, unique visitors, download clicks, mobile share.
   - Pageviews-by-day sparkline; top referrers / sources / pages; clicks;
     browser & OS breakdown; a recent-activity feed.
3. Or hit the API directly:
   ```bash
   curl "https://oss.naridon.com/api/stats?token=$ANALYTICS_TOKEN&days=7" | jq
   ```

## Where the page is served

`oss.naridon.com` is the relay, which serves the page from `backend/public/`
(mirrored from `landing/` via `npm run build:site`). So `/api/collect` and
`/api/stats` are **same-origin** — nothing extra to configure.

If you also serve the standalone static landing container (`landing/Dockerfile`,
nginx) on a **different** host, set the endpoint before `analytics.js` loads so
beacons reach the relay cross-origin (the collector already returns a permissive
`Access-Control-Allow-Origin`):

```html
<script>window.__ANALYTICS_ENDPOINT = 'https://oss.naridon.com/api/collect';</script>
```

## Deploy

```bash
npm run build:site          # mirror landing/ (incl. analytics.js + stats.html) → backend/public
# redeploy the relay (its Lightsail service) with ANALYTICS_TOKEN set
```
