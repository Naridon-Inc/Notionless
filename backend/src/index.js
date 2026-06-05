// Version: 3.0.0 - Stateless signaling-only relay
//
// This backend is a tiny stateless Node WebSocket broker. It stores NOTHING:
// no database, no accounts, no JWT, no Stripe, no user/document data. It only
// brokers peer-to-peer connections:
//   - HTTP  GET  /health          liveness check
//   - WS         /signaling       zero-auth WebRTC pub/sub broker (the P2P core)
//   - WS         /yjs/:docName     OPTIONAL non-persisting Yjs relay (NAT fallback)
//
// The Yjs relay never touches a database — it only forwards CRDT/awareness
// updates between connected peers (RELAY_ONLY). E2EE docs are encrypted before
// they ever reach the server.
const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const cors = require('cors');

const { PORT, ALLOWED_ORIGINS } = require('./config');
const logger = require('./logger');
const { setupWSConnection } = require('./yjs-handler');
const { setupSignalingConnection } = require('./signaling');
const analytics = require('./analytics');
const accounts = require('./accounts');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// First-party marketing-site analytics collector (see analytics.js for the
// privacy design: cookieless, no raw IP stored, DNT-honored, aggregate-only).
// Registered BEFORE the strict CORS gate because it's a write-only, no-credential
// public beacon that must accept cross-origin posts from the landing page; it
// sets its own permissive ACAO and returns no readable body. The client sends a
// text/plain body so it stays a CORS-"simple" request (no preflight).
app.options('/api/collect', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});
app.post('/api/collect', express.text({ type: '*/*', limit: '8kb' }), (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  try { analytics.record(req, req.body ? JSON.parse(req.body) : {}); }
  catch (e) { /* ignore malformed beacons — never error a beacon */ }
  res.sendStatus(204);
});

// CORS Configuration
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Aggregate analytics readout for the dashboard (stats.html). Token-gated via
// ANALYTICS_TOKEN; if no token is configured, only localhost may read. Same-origin
// (served from /public), so the global CORS gate below is fine for it.
app.get('/api/stats', (req, res) => {
  if (analytics.DISABLED) return res.status(404).json({ error: 'analytics disabled' });
  if (!analytics.authorized(req)) return res.status(401).json({ error: 'unauthorized' });
  const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
  return res.json(analytics.aggregate({ days, includeBots: req.query.bots === '1' }));
});

// OPTIONAL accounts layer (see accounts.js). OFF unless ACCOUNTS_ENABLED=1.
// This is an access gate for a self-hosted WEB instance; it never holds any
// note-decryption key (notes stay E2EE regardless). /config is always public so
// the web app can discover whether to show a sign-in screen.
const jsonBody = express.json({ limit: '8kb' });

app.get('/api/account/config', (req, res) => {
  res.json({
    enabled: accounts.ENABLED,
    signupAllowed: accounts.signupAllowed(),
    strict: accounts.STRICT,
    hasUsers: accounts.count() > 0,
  });
});

app.post('/api/account/signup', jsonBody, (req, res) => {
  const r = accounts.signup(req.body || {});
  if (!r.ok) return res.status(r.error === 'accounts_disabled' ? 404 : 400).json({ error: r.error });
  res.set('Set-Cookie', accounts.cookieHeader(r.token));
  return res.json({ user: r.user, token: r.token });
});

app.post('/api/account/login', jsonBody, (req, res) => {
  const r = accounts.login(req.body || {});
  if (!r.ok) return res.status(r.error === 'accounts_disabled' ? 404 : 401).json({ error: r.error });
  res.set('Set-Cookie', accounts.cookieHeader(r.token));
  return res.json({ user: r.user, token: r.token });
});

app.post('/api/account/logout', (req, res) => {
  res.set('Set-Cookie', accounts.clearCookieHeader());
  res.sendStatus(204);
});

app.get('/api/account/me', (req, res) => {
  if (!accounts.ENABLED) return res.status(404).json({ error: 'accounts_disabled' });
  const u = accounts.userFromReq(req);
  if (!u) return res.status(401).json({ error: 'unauthorized' });
  return res.json({ user: { id: u.uid, email: u.email, role: u.role } });
});

// Static landing page (the public face of oss.naridon.com). This is purely
// presentational — the relay still stores nothing. The marketing page lives in
// /landing as the source of truth and is synced here via `npm run build:site`
// (root script). WebSocket upgrades (/signaling, /yjs) bypass Express entirely,
// so serving static files at / does not affect the P2P relay.
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: '1h' }));

// WebSocket Handling
wss.on('connection', (conn, req) => {
  const url = req.url || '';

  // Strictly members-only instance: reject unauthenticated sync. Off by default
  // (ACCOUNTS_STRICT) so desktop peers on an open relay keep working; on, the web
  // app's session cookie rides the same-origin WS upgrade and is checked here.
  if (accounts.ENABLED && accounts.STRICT && !accounts.userFromReq(req)) {
    conn.close(1008, 'unauthorized');
    return;
  }

  if (url.startsWith('/yjs/')) {
    const parts = url.split('/yjs/')[1].split('?');
    const docName = parts[0];
    setupWSConnection(conn, req, { docName, gc: true });
    return;
  }

  if (url.startsWith('/signaling')) {
    setupSignalingConnection(conn, req);
    return;
  }

  conn.close();
});

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason) => {
  logger.error('process', 'Unhandled promise rejection', { reason: String(reason) });
});

// Global Error Handler
app.use((err, req, res, next) => {
  logger.error('server', 'Unhandled error', { path: req.path, error: err.message });
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: 'Internal Server Error' });
});

server.listen(PORT, () => {
  logger.info('server', `Signaling relay running on port ${PORT}`);
});
