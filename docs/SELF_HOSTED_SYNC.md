# Your own private cloud sync (optional)

Notionless works with **no server at all**. Your notes sync straight between your
own devices and your teammates, end‑to‑end encrypted. Nothing is stored in any
company's cloud. That's the default, and for most people it's perfect.

There's **one catch**: because there's no server holding your notes, someone on
the team has to be online for others to pull the latest changes. Close every
laptop and the newest edits just wait until someone opens the app again.

If you'd like your notes to be available **24/7 — like a normal cloud app — but
still completely private**, you can run your own tiny "always‑on box." It sits
online, holds a **scrambled (encrypted) copy** of your notes, and hands them to
your teammates whenever they come back. It **cannot read anything** — it never
sees your password, your keys, or a single word of your notes.

No accounts. No database to manage. No login system to build. Three steps,
about five minutes.

> **Two compose files — pick the one that matches what you want:**
>
> - **`docker-compose.cloud.yml`** *(this guide)* — just the **always-on box**:
>   the relay with encrypted persistence turned on. Add it to a team that already
>   uses the desktop/mobile apps so notes stay available 24/7. No web app.
> - **`docker-compose.selfhost.yml`** — the **full online app**: the box **plus a
>   Notion-style web app on your own domain**, so teammates open it in any browser
>   and your docs stay synced across **web + desktop + mobile**. It already defaults
>   to this always-on mode (`NL_MODE=online`). See
>   **[SELF_HOSTING.md](./SELF_HOSTING.md)**.
>
> Both store only ciphertext on **your** box — Naridon hosts nothing of yours.

---

## What you need

- Any computer that can stay on: a cheap **$4–6/month server** (DigitalOcean,
  Hetzner, Linode…), a **Raspberry Pi** at home, or even an old laptop.
- **Docker** installed on it. (On a fresh server: `curl -fsSL https://get.docker.com | sh`.)

That's the whole shopping list.

---

## Step 1 — Turn the box on (one command)

Copy the Notionless folder onto the box (`git clone` it), then run:

```bash
docker compose -f docker-compose.cloud.yml up -d
```

That's it — your always‑on sync box is now running and saving an encrypted copy
of your notes to its own disk. It restarts by itself if the machine reboots.

> Want to check it's alive? `curl http://localhost:9008/health` should say `ok`.

---

## Step 2 — Give it a web address (so your team can reach it)

Your box needs an address your teammates' apps can connect to, over a secure
(`wss://`) connection. The easiest way is **Caddy**, which gets you a free HTTPS
certificate automatically. Point a domain (e.g. `notes.yourname.com`) at your
box, then run this one command on the box:

```bash
docker run -d --network host caddy caddy reverse-proxy \
  --from notes.yourname.com --to localhost:9008
```

Your sync address is now: **`wss://notes.yourname.com/yjs`**

> Just testing on your home network? You can skip the domain and use
> `ws://<the-box's-local-IP>:9008/yjs` instead. (Plain `ws://` is fine on a
> trusted LAN; use `wss://` with a domain for anything over the internet.)

---

## Step 3 — Point the app at your box

Everyone on the team sets the **same** sync address, once.

- **Quickest (try it right now):** open the app, press the developer console
  (View → Toggle Developer Tools), paste this, and hit Enter:

  ```js
  localStorage.setItem('notionless_cloud_sync_url', 'wss://notes.yourname.com/yjs');
  location.reload();
  ```

- **Permanent (when building the app):** set the address before you build, and
  it's baked in for everyone:

  ```bash
  VITE_CLOUD_SYNC_URL="wss://notes.yourname.com/yjs" pnpm run build
  ```

Done. Your notes now sync through your own box and are available any time, even
when every teammate is offline.

**To turn it back off** (go back to pure peer‑to‑peer), clear the setting:

```js
localStorage.removeItem('notionless_cloud_sync_url'); location.reload();
```

---

## Is this still private? Yes.

- Everything is **encrypted on your device before it leaves**. The box only ever
  stores scrambled ciphertext in files named after a one‑way hash — it can't tell
  which note is which, and it can't read any of them.
- The encryption keys come from your **team link and password**, which **never
  reach the box**. Even someone who steals the whole server's disk gets nothing
  but noise.
- It's the same end‑to‑end encryption used in pure peer‑to‑peer mode — you're
  just adding a member that's always awake and only knows how to hold ciphertext.

### Honest fine print

- **Back it up.** This box is now where your "always available" copy lives. Its
  notes folder is the Docker volume `notionless-data` — snapshot it like any
  other server data. (Every teammate still keeps their own full local copy too,
  so a lost box is an inconvenience, not a catastrophe.)
- **It needs to stay reachable.** If the box goes down, you simply fall back to
  the normal peer‑to‑peer behaviour (sync when a teammate is online).
- **Anyone with the team link can still join the team** — the box doesn't add
  access control, it adds availability. Sharing controls live in the app.

---

## Where the settings live (reference)

| Setting | Where | What it does |
|---|---|---|
| `YJS_PERSIST_DIR` | the box (`docker-compose.cloud.yml`) | Folder for the encrypted note files. Setting it is what turns persistence on. |
| `notionless_cloud_sync_url` | the app (localStorage) | Per‑user runtime address of your box. |
| `VITE_CLOUD_SYNC_URL` | app build | Bakes the box address into a build for the whole team. |

Leave all of these unset and Notionless behaves exactly as before: pure,
serverless, end‑to‑end‑encrypted peer‑to‑peer.
