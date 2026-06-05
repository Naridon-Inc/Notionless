// OPTIONAL accounts layer — a thin, self-hostable access gate for the web app.
//
// OFF by default. The whole product is zero-account: identity is an Ed25519 key
// derived client-side from a team password (never sent anywhere), and notes are
// E2EE so the relay only ever sees ciphertext. That stays true whether or not
// accounts are on.
//
// What accounts ADD (when ACCOUNTS_ENABLED=1): a familiar "sign in to our
// company instance" gate in front of the self-hosted web app, so a deployment on
// `docs.yourcompany.com` isn't world-open. It is an ACCESS/CONVENIENCE layer only
// — it CANNOT and does NOT hold any note-decryption key. After signing in, a user
// still joins teams with the team password exactly as before. (This is the honest
// constraint of E2EE: a server account can gate access, never decrypt content.)
//
// Deliberately dependency-free: Node's built-in `crypto` (scrypt password hashing
// + HMAC-signed stateless session tokens) over an atomic JSON file. No database
// to set up, no native modules to compile — it just works in the slim image.
// Fine at small-team scale; swap the store for SQLite behind this same interface
// if a deployment ever outgrows it.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ENABLED = /^(1|true|yes|on)$/i.test(process.env.ACCOUNTS_ENABLED || '');
// 'open'  → anyone can self-serve sign up (good for a trusted company instance).
// 'closed'→ only the first account (the admin) can be created via signup; further
//           users must be added by the admin. Until the FIRST user exists, signup
//           is always allowed so the instance can be bootstrapped.
const SIGNUP_MODE = (process.env.ACCOUNTS_SIGNUP || 'open').toLowerCase();
// When true, the relay also rejects unauthenticated WebSocket sync (signaling +
// /yjs). Off by default so desktop peers on the default relay keep working; turn
// it on for a strictly web-only, members-only instance.
const STRICT = /^(1|true|yes|on)$/i.test(process.env.ACCOUNTS_STRICT || '');

const DIR = process.env.ACCOUNTS_DIR || path.join(__dirname, '..', '.accounts');
const STORE = path.join(DIR, 'users.json');
// Secret for HMAC-signing session tokens. Set ACCOUNTS_SECRET in prod so sessions
// survive restarts; otherwise we use a per-boot random (sessions reset on deploy).
const SECRET = process.env.ACCOUNTS_SECRET
  || crypto.randomBytes(32).toString('hex');
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const COOKIE = 'nl_session';

function ensureDir() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(STORE, 'utf8'));
  } catch (e) {
    return { version: 1, users: [] };
  }
}

function save(db) {
  ensureDir();
  const tmp = `${STORE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, STORE); // atomic replace
}

function normEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashPassword(password, salt) {
  // scrypt with sane cost; returns hex. Salt is per-user random hex.
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function publicUser(u) {
  return { id: u.id, email: u.email, role: u.role, createdAt: u.createdAt };
}

// --- stateless session tokens (HMAC-signed, no server-side session store) ---
function b64u(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(str) {
  return Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function sign(payloadStr) {
  return b64u(crypto.createHmac('sha256', SECRET).update(payloadStr).digest());
}
function issueToken(user) {
  const payload = { uid: user.id, email: user.email, role: user.role, exp: nowMs() + SESSION_TTL_MS };
  const body = b64u(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}
function verifyToken(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  // constant-time compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(unb64u(body).toString('utf8')); } catch (e) { return null; }
  if (!payload || !payload.exp || payload.exp < nowMs()) return null;
  return payload; // { uid, email, role, exp }
}

// Date.now() wrapper kept in one place (the workflow/runtime forbids it in some
// contexts; the relay process is allowed to call it normally).
function nowMs() { return Date.now(); }

// --- public API ---

function count() {
  return load().users.length;
}

function signupAllowed() {
  if (!ENABLED) return false;
  if (count() === 0) return true; // always allow bootstrapping the first (admin) user
  return SIGNUP_MODE === 'open';
}

// { ok, user, token, error }
function signup({ email, password }) {
  if (!ENABLED) return { ok: false, error: 'accounts_disabled' };
  const e = normEmail(email);
  if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { ok: false, error: 'invalid_email' };
  if (!password || String(password).length < 8) return { ok: false, error: 'weak_password' };
  const db = load();
  const first = db.users.length === 0;
  if (!first && SIGNUP_MODE !== 'open') return { ok: false, error: 'signup_closed' };
  if (db.users.some((u) => u.email === e)) return { ok: false, error: 'email_taken' };
  const salt = crypto.randomBytes(16).toString('hex');
  const user = {
    id: crypto.randomUUID(),
    email: e,
    salt,
    pwHash: hashPassword(password, salt),
    role: first ? 'admin' : 'member',
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  save(db);
  return { ok: true, user: publicUser(user), token: issueToken(user) };
}

// { ok, user, token, error }
function login({ email, password }) {
  if (!ENABLED) return { ok: false, error: 'accounts_disabled' };
  const e = normEmail(email);
  const db = load();
  const user = db.users.find((u) => u.email === e);
  if (!user) return { ok: false, error: 'invalid_credentials' };
  const attempt = hashPassword(password, user.salt);
  const a = Buffer.from(attempt);
  const b = Buffer.from(user.pwHash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: 'invalid_credentials' };
  }
  return { ok: true, user: publicUser(user), token: issueToken(user) };
}

// Pull a session token from cookie, Authorization header, or ?token=.
function tokenFromReq(req) {
  const hdr = req.headers && req.headers.authorization;
  if (hdr && hdr.startsWith('Bearer ')) return hdr.slice(7).trim();
  const cookie = req.headers && req.headers.cookie;
  if (cookie) {
    const m = cookie.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`));
    if (m) return decodeURIComponent(m.slice(COOKIE.length + 1));
  }
  try {
    const u = new URL(req.url, 'http://x');
    const t = u.searchParams.get('token');
    if (t) return t;
  } catch (e) { /* ignore */ }
  return null;
}

function userFromReq(req) {
  return verifyToken(tokenFromReq(req));
}

function cookieHeader(token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  // HttpOnly so JS can't read it; SameSite=Lax is fine (same-origin app). Secure
  // is set by the proxy/TLS terminator in prod; we leave it off so local HTTP works.
  return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
function clearCookieHeader() {
  return `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

module.exports = {
  ENABLED,
  STRICT,
  SIGNUP_MODE,
  COOKIE,
  count,
  signupAllowed,
  signup,
  login,
  verifyToken,
  tokenFromReq,
  userFromReq,
  cookieHeader,
  clearCookieHeader,
};
