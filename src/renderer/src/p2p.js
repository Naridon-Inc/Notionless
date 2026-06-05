import { WebrtcProvider } from 'y-webrtc'
import sodium from 'libsodium-wrappers'
import { Config } from './config'

/**
 * Opus P2P Network Layer
 * Handles decentralized synchronization using WebRTC.
 *
 * INVARIANTS:
 * 1. Syncs CRDT operations ONLY (no raw text).
 * 2. Uses encryption for all traffic (At Rest & In Transit).
 * 3. No central server is required for correctness (only signaling).
 * 4. Room name derived via cryptographic hash (server can't reverse the key).
 * 5. Works identically on Electron and Web — WebRTC is browser-native.
 */

let sodiumReady = false
const sodiumInit = sodium.ready.then(() => { sodiumReady = true })

/**
 * Accountless "Share via link / room code" helpers.
 *
 * A share code is just a URL-safe random secret. Both peers feed the SAME
 * secret into P2PNetwork as `roomKeyHex`, which (a) derives the swarm topic
 * via BLAKE2b and (b) is the WebRTC password. No server account, no team
 * membership, no DB row — the relay only brokers WebRTC and never sees the
 * secret (it only sees the hashed topic). Identical on Electron and Web.
 */
export const SHARE_PREFIX = 'notionless-share:'

/**
 * Generate a fresh URL-safe room code using crypto.getRandomValues.
 * @param {number} bytes entropy in bytes (default 18 → 24 base64url chars)
 */
export function generateRoomCode(bytes = 18) {
  const buf = new Uint8Array(bytes)
  const g = (typeof window !== 'undefined' && window.crypto) ||
    (typeof globalThis !== 'undefined' && globalThis.crypto)
  if (g && g.getRandomValues) {
    g.getRandomValues(buf)
  } else {
    // Last-resort fallback (should never hit in a browser/Electron renderer)
    for (let i = 0; i < bytes; i++) buf[i] = Math.floor(Math.random() * 256)
  }
  let bin = ''
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
  // base64url, no padding
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Build a shareable string for a given room code, e.g.
 *   "notionless-share:AbC123..."
 */
export function buildShareCode(roomCode) {
  return `${SHARE_PREFIX}${roomCode}`
}

/**
 * Build a shareable URL anchored to the current origin (web) or the production
 * web app, using a `#share=<code>` hash so it works without any server route.
 */
export function buildShareLink(roomCode, baseUrl) {
  let origin = baseUrl
  if (!origin && typeof window !== 'undefined' && window.location) {
    const { protocol, host } = window.location
    // Avoid emitting file:// links from the Electron renderer.
    if (protocol === 'http:' || protocol === 'https:') origin = `${protocol}//${host}`
  }
  // No web origin (e.g. Electron file://): fall back to the portable code form,
  // which parseShareCode() also accepts.
  if (!origin) return buildShareCode(roomCode)
  return `${origin}/#share=${encodeURIComponent(roomCode)}`
}

/**
 * Extract a room code from a pasted share string. Accepts:
 *   - "notionless-share:<code>"
 *   - a URL containing "#share=<code>" or "?share=<code>"
 *   - a bare code
 * Returns null if nothing usable is found.
 */
export function parseShareCode(input) {
  if (!input) return null
  const raw = String(input).trim()
  if (!raw) return null

  if (raw.startsWith(SHARE_PREFIX)) {
    const code = raw.slice(SHARE_PREFIX.length).trim()
    return code || null
  }

  // Try URL hash/query form (#share= or ?share=)
  const m = raw.match(/[#?&]share=([^#?&\s]+)/)
  if (m) {
    try { return decodeURIComponent(m[1]) } catch (_e) { return m[1] }
  }

  // Bare code: only accept if it looks like a URL-safe token (no spaces/scheme)
  if (/^[A-Za-z0-9_-]{8,}$/.test(raw)) return raw

  return null
}

/**
 * Team links. A team is addressed by ONE secret `teamRootKey`; team-keys.js
 * derives the team doc id, swarm key, and E2EE key from it. The link is the
 * team's whole access boundary (see caveat R9 — it's a static capability).
 */
export const TEAM_PREFIX = 'notionless-team:'

/** Fresh team root secret (same entropy/shape as a share code). */
export function generateTeamKey(bytes = 18) {
  return generateRoomCode(bytes)
}

/** Portable team code, e.g. "notionless-team:AbC123...". */
export function buildTeamCode(teamRootKey) {
  return `${TEAM_PREFIX}${teamRootKey}`
}

/**
 * Shareable team link as a `notionless://invite#team=<key>` deep link. Clicking
 * it opens the installed desktop app and joins the team (there is no web app).
 * The secret rides in the URL fragment, so it never reaches any server. Pass
 * `scheme` to override; falls back to the bare `notionless-team:` code form if
 * no scheme is configured.
 */
export function buildTeamLink(teamRootKey, scheme) {
  const base = String(scheme || (Config && Config.APP_DEEP_LINK) || '').replace(/[#/]+$/, '')
  if (!base) return buildTeamCode(teamRootKey)
  return `${base}#team=${encodeURIComponent(teamRootKey)}`
}

/**
 * Extract a team root key from a pasted team link. Accepts
 * "notionless-team:<key>" or a URL containing "#team=" / "?team=". Returns null
 * if the input isn't a team link (so callers can fall through to share codes).
 */
export function parseTeamCode(input) {
  if (!input) return null
  const raw = String(input).trim()
  if (!raw) return null
  if (raw.startsWith(TEAM_PREFIX)) {
    const key = raw.slice(TEAM_PREFIX.length).trim()
    return key || null
  }
  const m = raw.match(/[#?&]team=([^#?&\s]+)/)
  if (m) { try { return decodeURIComponent(m[1]) } catch (_e) { return m[1] } }
  return null
}

/**
 * Per-note least-privilege share token (`share:v2`). Grants exactly one note —
 * never the team index or roster — by carrying that note's swarm key AND its
 * symmetric E2EE key directly. Form: "notionless-share:v2.<swarmKey>.<e2eeKey>".
 *
 * Both halves are URL-safe (swarmKey is hex; e2eeKey is libsodium URL-safe
 * base64, no padding), so the '.'-delimited token is safe in a URL hash.
 */
export function buildShareV2Code(swarmKey, e2eeKey) {
  return `${SHARE_PREFIX}v2.${swarmKey}.${e2eeKey}`
}

export function buildShareV2Link(swarmKey, e2eeKey, scheme) {
  const base = String(scheme || (Config && Config.APP_DEEP_LINK) || '').replace(/[#/]+$/, '')
  if (!base) return buildShareV2Code(swarmKey, e2eeKey)
  return `${base}#share=v2.${encodeURIComponent(swarmKey)}.${encodeURIComponent(e2eeKey)}`
}

/**
 * Unified share-token parser. Returns one of:
 *   { version: 1, code }                       — legacy/standalone swarm-password share
 *   { version: 2, swarmKey, e2eeKey }           — least-privilege E2EE per-note share
 *   null                                        — not a share token
 */
export function parseShareToken(input) {
  if (!input) return null
  const raw = String(input).trim()

  let payload = null
  if (raw.startsWith(SHARE_PREFIX)) {
    payload = raw.slice(SHARE_PREFIX.length).trim()
  } else {
    const m = raw.match(/[#?&]share=([^#?&\s]+)/)
    if (m) { try { payload = decodeURIComponent(m[1]) } catch (_e) { payload = m[1] } }
    else if (/^v2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw)) payload = raw
  }

  if (payload && payload.startsWith('v2.')) {
    const parts = payload.split('.')
    if (parts.length === 3 && parts[1] && parts[2]) {
      return { version: 2, swarmKey: parts[1], e2eeKey: parts[2] }
    }
    return null
  }

  const code = parseShareCode(input)
  return code ? { version: 1, code } : null
}

export class P2PNetwork {
  constructor(engine, roomKeyHex, options = {}) {
    this.engine = engine
    this.roomKeyHex = roomKeyHex
    this.provider = null
    this.connected = false
    this.peerCount = 0
    this._destroyed = false

    // Signaling servers — local (Electron only) + optional self-hosted relay.
    // The relay only brokers WebRTC connections; it never sees note content
    // (room names are BLAKE2b hashes and all traffic is E2E encrypted).
    const isLocalDev = typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    const relayUrl = (Config && Config.SIGNALING_URL) || null
    this.signalingServers = isLocalDev ? [] : (relayUrl ? [relayUrl] : [])

    // Add local signaling if on Electron (port 4444). The mobile companion mocks
    // window.api too, but there is no localhost signaling server on a phone — and
    // in localhost-served PWA dev it would even shadow the real relay — so the
    // is-mobile surface is excluded alongside is-web (it always uses the relay).
    if (typeof window !== 'undefined' && window.api &&
        !document.body.classList.contains('is-web') &&
        !document.body.classList.contains('is-mobile')) {
      this.signalingServers.unshift('ws://localhost:4444')
    }

    this._init()
  }

  async _init() {
    // Derive room name cryptographically
    await sodiumInit
    this.roomName = `notionless-${this._deriveRoomName(this.roomKeyHex)}`
    this.connect()
  }

  /**
   * Derive room name from secret key using BLAKE2b hash.
   * The signaling server sees the hash, not the key.
   */
  _deriveRoomName(key) {
    if (!sodiumReady) {
      // Fallback if sodium isn't ready yet (shouldn't happen after await)
      console.warn('[P2P] Sodium not ready, using fallback hash')
      return this._fallbackHash(key)
    }
    const keyBytes = sodium.from_string(key)
    const hash = sodium.crypto_generichash(32, keyBytes)
    return sodium.to_hex(hash)
  }

  _fallbackHash(key) {
    let hash = 0
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash) + key.charCodeAt(i)
      hash |= 0
    }
    return Math.abs(hash).toString(16)
  }

  connect() {
    if (this._destroyed || !this.roomName) return
    console.log(`[P2P] Connecting to swarm: ${this.roomName.slice(0, 16)}...`)

    // When the engine is E2EE, peers must exchange the ENCRYPTED transport doc
    // (a Y.Array of AEAD blobs), never the plaintext CRDT. Mirrors the cloud
    // path in team.js: `isEncrypted ? transportDoc : doc`. Awareness/presence
    // stays on the main doc's awareness (intentionally plaintext — see R3).
    const syncDoc = (this.engine.isEncrypted && this.engine.transportDoc)
      ? this.engine.transportDoc
      : this.engine.doc

    this.provider = new WebrtcProvider(this.roomName, syncDoc, {
      signaling: this.signalingServers,
      password: this.roomKeyHex,
      awareness: this.engine.awareness,
      maxConns: 20,
      filterBcConns: true
    })

    this.provider.on('status', event => {
      this.connected = event.connected
      console.log(`[P2P] Status: ${event.status}`)
      this._emitSyncStatus()
    })

    this.provider.on('synced', event => {
      console.log(`[P2P] Synced with peers`)
      this._emitSyncStatus()
    })

    this.provider.on('peers', event => {
      this.peerCount = event.webrtcPeers?.length || 0
      console.log(`[P2P] Peers: ${this.peerCount}`)
      this._emitSyncStatus()
    })

    // OPTIONAL always-on cloud mirror. When the user has configured a self-hosted
    // persisting relay, also sync the SAME doc (the encrypted transportDoc when
    // E2EE — never plaintext) over WebSocket so notes stay available even when no
    // teammate is online. Default-off: with no CLOUD_SYNC_URL this is a no-op and
    // the app stays pure-P2P.
    this._connectCloudMirror(syncDoc)
  }

  /**
   * Attach a y-websocket provider to a self-hosted persisting relay, bound to the
   * SAME doc the WebRTC provider uses (encrypted transport doc under E2EE). The
   * relay persists ciphertext keyed by the BLAKE2b room hash, so it can serve the
   * latest state with zero humans online. Lazily imports y-websocket so the cloud
   * code never loads for pure-P2P users.
   */
  _connectCloudMirror(syncDoc) {
    // Build-time env (VITE_CLOUD_SYNC_URL) is the primary source; a localStorage
    // override lets a user point the app at their box at runtime (no rebuild) —
    // see docs/SELF_HOSTED_SYNC.md.
    let configured = (Config && Config.CLOUD_SYNC_URL) || ''
    try {
      if (typeof localStorage !== 'undefined') {
        // Explicit per-user opt-out (the in-app "always-on sync" toggle). Lets
        // someone on a full-online self-host bundle drop their OWN client back to
        // pure peer-to-peer at runtime — no rebuild, no server change.
        if (localStorage.getItem('notionless_cloud_sync_disabled') === '1') return
        const override = localStorage.getItem('notionless_cloud_sync_url')
        if (override) configured = override
      }
    } catch (_e) { /* localStorage may be unavailable */ }
    const base = String(configured || '').replace(/\/$/, '')
    if (!base || this._destroyed) return
    import('y-websocket').then(({ WebsocketProvider }) => {
      if (this._destroyed) return
      try {
        this.cloudProvider = new WebsocketProvider(base, this.roomName, syncDoc, {
          awareness: this.engine.awareness,
          connect: true,
        })
        this.cloudProvider.on('status', (e) => {
          console.log(`[P2P] Cloud mirror: ${e.status}`)
          this._emitSyncStatus()
        })
        console.log(`[P2P] Cloud mirror enabled → ${base}`)
      } catch (e) {
        console.warn('[P2P] Cloud mirror failed to attach (staying pure-P2P):', e)
      }
    }).catch((e) => console.warn('[P2P] y-websocket unavailable:', e))
  }

  _emitSyncStatus() {
    window.dispatchEvent(new CustomEvent('sync:status', {
      detail: {
        docId: this.engine.docId,
        p2p: { connected: this.connected, peers: this.peerCount }
      }
    }))
  }

  /**
   * Re-bind this network to an explicit shared room code (accountless sharing).
   * Tears down the current swarm connection and reconnects using the given
   * room key as both the topic seed and the WebRTC password. The room is
   * fully decoupled from docId / account — any peer holding the same code
   * joins the same swarm.
   */
  async joinSharedRoom(roomCode) {
    if (this._destroyed || !roomCode) return
    if (this.cloudProvider) {
      try { this.cloudProvider.destroy() } catch (_e) { /* ignore */ }
      this.cloudProvider = null
    }
    if (this.provider) {
      this.provider.destroy()
      this.provider = null
      this.connected = false
      this.peerCount = 0
    }
    this.roomKeyHex = roomCode
    await sodiumInit
    this.roomName = `notionless-${this._deriveRoomName(this.roomKeyHex)}`
    console.log('[P2P] Joining shared room from code')
    this.connect()
  }

  disconnect() {
    this._destroyed = true
    if (this.cloudProvider) {
      try { this.cloudProvider.destroy() } catch (_e) { /* ignore */ }
      this.cloudProvider = null
    }
    if (this.provider) {
      this.provider.destroy()
      this.provider = null
      this.connected = false
      this.peerCount = 0
      console.log(`[P2P] Disconnected`)
    }
  }
}
