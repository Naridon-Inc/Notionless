# Notionless — Product Hunt launch kit

Everything you need to launch Notionless on Product Hunt (and Hacker News /
Reddit / X). Copy is written and ready to paste; swap names/links as needed.

**The one-line positioning**

> The open-source, local-first Notion alternative with a **Claude Code brain** —
> your notes are plain Markdown on your disk, sync peer-to-peer end-to-end
> encrypted, and an AI answers across your whole workspace using the Claude Code
> you already run.

Lead with three things people instantly grok: **open source**, **local-first /
own your data**, and **Claude Code**. The Claude Code angle is the hook — people
already know and trust it, so "plug in the Claude Code you already run" needs no
explanation and does the differentiation for us.

---

## 1. The basics (PH form fields)

| Field | Value |
|---|---|
| **Name** | Notionless |
| **Tagline** (≤60 chars) | see options below |
| **Topics** | Open Source · Productivity · Note · Privacy · Artificial Intelligence · Developer Tools |
| **Links** | Site `https://oss.naridon.com` · GitHub `https://github.com/Naridon-Inc/Notionless` · Download (latest release) |
| **Pricing** | Free (and open source) |
| **Platforms** | macOS (Windows/Linux on roadmap), iOS/Android companion |

### Tagline options (pick one, all ≤60 chars)

1. `Local-first Notion alternative with a Claude Code brain` (54)
2. `Own your notes. And the AI that reads them.` (43)
3. `The open-source Notion alt that runs on your own Claude` (54)
4. `Notion, but local-first, encrypted, and AI you own` (50)
5. `Markdown notes + a Company Brain powered by Claude Code` (54)

**Recommended:** #1 — it stacks all three hooks (local-first / Notion alternative
/ Claude Code) into one line.

### Description (≤260 chars)

> Notionless is an open-source, local-first Notion alternative. Notes are plain
> Markdown on your disk; teams sync peer-to-peer, end-to-end encrypted, with no
> account. Its Company Brain answers across your workspace using the Claude Code
> you already run — or a fully-local model.

(257 chars.)

---

## 2. Gallery (the visual story)

Order matters — PH shows the first image as the hero. Use our real, framed assets
from `landing/`. Recommended sequence:

| # | Asset | Caption |
|---|---|---|
| 1 | `hero.png` | "Your notes, on your machine — not the cloud." |
| 2 | `motion-brain.webp` → export MP4/GIF | "Company Brain: ask your whole workspace in plain language." |
| 3 | A **terminal still** of the Brain on the `claude-code` backend (screenshot the hero terminal card, or `term`) | "Plug in the Claude Code you already run. Or local Ollama. Or your own key." |
| 4 | `motion-database.webp` → MP4/GIF | "Notion-style databases, stored as portable Markdown." |
| 5 | `shot-editor.png` | "A real editor — live-preview Markdown, callouts, tables, Mermaid." |
| 6 | `shot-share.png` | "Share one link. No account, ever. End-to-end encrypted." |
| 7 | `shot-plugins.png` | "Extensible: describe a plugin in the Plugin Lab and it's scaffolded." |

Notes:
- PH gallery accepts images + video. Convert the two `.webp` motions to **MP4**
  (best quality on PH) or GIF: `ffmpeg -i motion-brain.webp motion-brain.mp4`.
- First image should be **1270×760** or similar landscape; our shots are wider, so
  they'll letterbox cleanly on the dark frame (intended).
- The **thumbnail/logo**: the Notionless mark — a hand-drawn white 3D cube on a
  black rounded square (`landing/logo.svg` / `build/icon.svg`). This is the real
  app icon; don't use the old hexagon mark.

---

## 3. Maker's first comment (post this the second you launch)

> Hey Product Hunt 👋 — maker here.
>
> I built Notionless because I wanted Notion's editor and databases without
> handing my team's entire brain to someone else's cloud. So I made the opposite
> trade: every note is a plain Markdown file in a folder **you** own, on your own
> machine.
>
> There's no account and no sign-up. You create a team, share **one link**, and
> edits sync directly between devices over WebRTC — end-to-end encrypted with
> libsodium. The only thing I host is a tiny stateless relay that helps peers find
> each other; it sees hashed topics and ciphertext, stores nothing, and you can
> self-host it with Docker in about a minute.
>
> The part I'm most excited about is the **Company Brain**. It reads across your
> whole workspace and answers in plain language, citing the exact notes it used.
> Retrieval is **100% local** — your notes are never bulk-uploaded to be searched.
> And the answer model is *yours*: point it at the **Claude Code** you already
> run, a fully-offline local model (Ollama), or your own API key. A genuinely
> smart workspace assistant — no new subscription, and nothing leaves your machine
> to be indexed.
>
> It's **AGPL-3.0 and fully open source** — both the app and the relay are on
> GitHub. macOS ships today (universal, Apple Silicon + Intel, signed &
> notarized), there's a native iOS/Android companion, and Windows/Linux are on the
> roadmap.
>
> Honest trade-offs, all documented: it's built for **small teams** (the P2P mesh
> has limits), there's no remote revocation yet (removing someone = rotating the
> team link), and anyone with a team link can read that team's roster. I'd rather
> you hear that from me than find it later.
>
> I'd love your feedback — especially on the Brain + Claude Code integration.
> **What would it take for you to trust your own team's docs to something like
> this?**
>
> ⬇️ macOS download + source: https://github.com/Naridon-Inc/Notionless · site:
> https://oss.naridon.com

---

## 4. Pre-written replies (drop in as questions come)

**"How is it 'Claude Code-based'? Is it official?"**
> It's not an official Anthropic product — it's compatibility. The Brain is a
> tool-using agent over your notes, and its answer backend is pluggable. Set it to
> `claude-code` and it calls the Claude Code CLI you already have installed, so you
> reuse your existing Claude with no extra key to wire up. Prefer fully offline?
> Switch to Ollama. Have an API key? Use any OpenAI-compatible endpoint.

**"Does my data / do my notes go to the cloud or to Anthropic?"**
> Indexing and search are entirely local — notes are never bulk-uploaded to be
> searched. When you ask a question, only that question + the few relevant
> snippets go to the backend you chose. With local Ollama, *nothing* leaves your
> machine. With Claude Code or your own key, only those snippets go, under your own
> account.

**"How is this different from Obsidian / Logseq?"**
> Closest cousins, and we love them. Two differences: (1) collaboration is
> **built-in and peer-to-peer** — share one link, edit live, end-to-end encrypted,
> no plugins or paid sync tier; (2) the **Company Brain** is a first-class,
> backend-pluggable AI over your vault (incl. Claude Code), not a bolt-on.

**"What does your server see?"**
> A tiny stateless signaling relay that helps peers find each other over hashed
> topics. It sees hashed topic names and end-to-end-encrypted blobs — never your
> titles, content, or keys — and stores nothing. You can self-host it with Docker
> in seconds.

**"Windows / Linux?"**
> On the roadmap — the app is Electron, so it's packaging + testing. Star the repo
> to get notified. macOS (universal) ships today, plus a native mobile companion.

**"Is it really free?"**
> Yes — free and open source forever, AGPL-3.0. No paid tier, no account. Both the
> app and the relay are public on GitHub.

---

## 5. Cross-post copy

### X / Twitter (thread)

> 1/ Launched Notionless on Product Hunt today 🚀
> An open-source, local-first Notion alternative — your notes are plain Markdown
> on your disk, synced peer-to-peer & end-to-end encrypted. No account. No cloud.
> [link]
>
> 2/ The hook: a **Company Brain** that reads your whole workspace and answers in
> plain language — retrieval runs 100% locally, and the answer model is *yours*:
> plug in the **Claude Code** you already run, local Ollama, or your own key.
>
> 3/ No vendor database holding your notes. The only thing hosted is a stateless
> relay that sees ciphertext and stores nothing. Self-host it in seconds.
>
> 4/ AGPL-3.0, client + relay on GitHub. macOS today (universal), native mobile
> companion, Windows/Linux coming. Free forever. ⭐ the repo if you like it: [link]

### Hacker News (Show HN)

> **Show HN: Notionless – local-first Notion alternative with a Claude Code brain**
>
> Notionless is an open-source (AGPL-3.0) desktop app: Notion-style editor and
> databases, but every note is a plain Markdown file on your disk. No account —
> you create a team and share one link; edits sync peer-to-peer over WebRTC,
> end-to-end encrypted with libsodium. The only hosted piece is a stateless
> signaling relay that stores nothing.
>
> The bit I'd love feedback on: the Company Brain is a tool-using agent over your
> notes with a pluggable answer backend. Retrieval/indexing is fully local; the
> model can be the Claude Code CLI you already run, local Ollama, or any
> OpenAI-compatible endpoint. CRDTs (Yjs) for conflict-free realtime; CodeMirror 6
> for the editor.
>
> Trade-offs are honest and documented: small-team scale (y-webrtc mesh), no
> remote revocation, roster readable by anyone with the team link. Code: [GitHub].

### Reddit (r/selfhosted, r/opensource, r/privacy)

> **Notionless: a local-first, open-source Notion alternative — Markdown on disk,
> P2P encrypted sync, and an AI brain you run yourself (Claude Code / Ollama)**
>
> No account, no cloud database. Notes are plain `.md` files you own; teams sync
> directly device-to-device, end-to-end encrypted; the only server is a stateless
> relay you can self-host. The Company Brain does local retrieval over your vault
> and lets you plug in your own model. AGPL-3.0. macOS + mobile companion. [link]

---

## 6. Launch-day checklist

- [ ] Launch **12:01 AM PT** (PH day resets at midnight Pacific — earliest = full day of votes).
- [ ] Post the maker's first comment immediately (§3).
- [ ] Line up a hunter (optional) or self-launch; have the gallery (§2) uploaded and ordered.
- [ ] Convert `motion-brain.webp` + `motion-database.webp` → MP4 for the gallery.
- [ ] First image = `hero.png`; thumbnail = Notionless mark on dark.
- [ ] Pin the GitHub repo, make sure the latest release + README are current.
- [ ] Cross-post the X thread + Show HN within the first 1–2 hours; reply to every comment.
- [ ] Add a "🚀 We're live on Product Hunt" banner/link to `oss.naridon.com` (optional).
- [ ] Have §4 replies ready; respond fast — engagement velocity matters.

## 7. Who it's for (audience framing)

- **Privacy-minded teams** who can't or won't put their workspace in a vendor cloud.
- **Developers / technical founders** who already use Claude Code and want their
  notes to be just files + git.
- **Self-hosters** who want zero-account, P2P collaboration they fully control.
- **Obsidian/Logseq users** who want built-in realtime collaboration + an AI brain.
