// First-party, privacy-respecting web analytics for the marketing page only.
//
// This is deliberately NOT third-party tracking. It exists so we can see how the
// landing page (oss.naridon.com) is doing — pageviews, referrers (e.g. Product
// Hunt), and download clicks — without betraying the product's privacy stance:
//
//   - No cookies, no localStorage, no cross-site identifiers, no fingerprinting.
//   - Raw IP addresses are NEVER stored. A visitor is counted via a hash of
//     (daily-rotating salt + ip + user-agent); the salt rotates every UTC day and
//     is derived from a server secret, so the hash cannot be reversed to an IP nor
//     correlated across days into a persistent profile.
//   - Only non-PII signals are kept: path, referrer host, UTM tags, coarse
//     browser/OS, screen/viewport size, language, timezone.
//   - Honors Do Not Track (the client never sends when DNT=1).
//   - Append-only per-day NDJSON files on local disk; aggregate-only readout.
//
// The P2P relay itself still stores nothing about your notes, keys, or identity —
// this touches only the public marketing site, and is fully disableable
// (ANALYTICS_DISABLE=true).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

const DISABLED = String(process.env.ANALYTICS_DISABLE || '').toLowerCase() === 'true';
const DIR = process.env.ANALYTICS_DIR || path.join(__dirname, '..', '.analytics');
const TOKEN = process.env.ANALYTICS_TOKEN || '';
// Base secret for the daily salt. Stable across restarts (so unique counts don't
// reset on redeploy) but never written to disk. Falls back to a per-boot random.
const SALT_BASE = process.env.ANALYTICS_SALT || TOKEN || crypto.randomBytes(16).toString('hex');

if (!DISABLED) {
  try { fs.mkdirSync(DIR, { recursive: true }); }
  catch (e) { logger.warn('analytics', 'could not create data dir', { dir: DIR, error: e.message }); }
}

// ---- helpers ---------------------------------------------------------------

const today = () => new Date().toISOString().slice(0, 10);

// daily-rotating, irreversible salt: H(secret + day). Never stored.
function dailySalt(day) {
  return crypto.createHash('sha256').update(SALT_BASE + '|' + day).digest('hex');
}

function clientIp(req) {
  const xff = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || (req.socket && req.socket.remoteAddress) || '';
}

// anonymous, daily visitor id — for de-duped unique counts only.
function visitorId(req, day) {
  const ua = req.headers['user-agent'] || '';
  return crypto.createHash('sha256')
    .update(dailySalt(day) + '|' + clientIp(req) + '|' + ua)
    .digest('hex').slice(0, 18);
}

const BOT_RE = /(bot|crawl|spider|slurp|bing|google|facebookexternal|embedly|quora|pinterest|preview|curl|wget|python|headless|lighthouse|pingdom|uptime|monitor|gptbot|claudebot|ahrefs|semrush)/i;

function parseUa(ua) {
  ua = ua || '';
  const mobile = /(iphone|ipod|android.*mobile|windows phone)/i.test(ua);
  let browser = 'Other';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/opr\/|opera/i.test(ua)) browser = 'Opera';
  else if (/firefox\//i.test(ua)) browser = 'Firefox';
  else if (/chrome\//i.test(ua)) browser = 'Chrome';
  else if (/safari\//i.test(ua)) browser = 'Safari';
  let os = 'Other';
  if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/mac os x/i.test(ua)) os = 'macOS';
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/linux/i.test(ua)) os = 'Linux';
  return { browser, os, mobile, bot: BOT_RE.test(ua) };
}

const str = (v, n = 200) => (typeof v === 'string' ? v.slice(0, n) : undefined);
function refHost(ref) {
  if (!ref) return undefined;
  try { return new URL(ref).hostname.replace(/^www\./, '') || undefined; }
  catch { return undefined; }
}

// ---- write -----------------------------------------------------------------

function record(req, body) {
  if (DISABLED) return;
  body = body && typeof body === 'object' ? body : {};
  const day = today();
  const ua = parseUa(req.headers['user-agent']);
  const ref = str(body.ref || body.referrer, 300);
  const ev = {
    ts: new Date().toISOString(),
    day,
    event: str(body.event, 40) || 'pageview',
    path: str(body.path, 200) || '/',
    ref,
    refHost: refHost(ref),
    utm_source: str(body.utm_source, 80),
    utm_medium: str(body.utm_medium, 80),
    utm_campaign: str(body.utm_campaign, 120),
    label: str(body.label, 80),       // for click events: 'download' | 'github' | ...
    screen: str(body.screen, 16),
    viewport: str(body.viewport, 16),
    lang: str(body.lang, 12),
    tz: str(body.tz, 48),
    browser: ua.browser,
    os: ua.os,
    mobile: ua.mobile,
    bot: ua.bot,
    vid: visitorId(req, day),
  };
  // drop undefined keys for compact lines
  Object.keys(ev).forEach((k) => ev[k] === undefined && delete ev[k]);
  fs.appendFile(path.join(DIR, `events-${day}.ndjson`), JSON.stringify(ev) + '\n', (err) => {
    if (err) logger.warn('analytics', 'append failed', { error: err.message });
  });
}

// ---- read / aggregate ------------------------------------------------------

function listDayFiles(days) {
  let files = [];
  try { files = fs.readdirSync(DIR).filter((f) => /^events-\d{4}-\d{2}-\d{2}\.ndjson$/.test(f)).sort(); }
  catch { return []; }
  return files.slice(-Math.max(1, days));
}

function topN(map, n = 12) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ key: k, count: v }));
}

function aggregate({ days = 30, includeBots = false } = {}) {
  const files = listDayFiles(days);
  const byDay = {};                 // day -> {views, uniques:Set}
  const paths = {}; const refs = {}; const sources = {};
  const browsers = {}; const oses = {}; const clicks = {};
  const uniqueAll = new Set();
  let views = 0; let mobile = 0; const recent = [];

  for (const f of files) {
    let lines;
    try { lines = fs.readFileSync(path.join(DIR, f), 'utf8').split('\n'); }
    catch { continue; }
    for (const line of lines) {
      if (!line) continue;
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (e.bot && !includeBots) continue;
      if (e.event === 'pageview') {
        views += 1;
        if (e.mobile) mobile += 1;
        (byDay[e.day] = byDay[e.day] || { day: e.day, views: 0, uniques: new Set() });
        byDay[e.day].views += 1;
        if (e.vid) { byDay[e.day].uniques.add(e.vid); uniqueAll.add(e.vid); }
        if (e.path) paths[e.path] = (paths[e.path] || 0) + 1;
        if (e.refHost) refs[e.refHost] = (refs[e.refHost] || 0) + 1;
        if (e.utm_source) sources[e.utm_source] = (sources[e.utm_source] || 0) + 1;
        if (e.browser) browsers[e.browser] = (browsers[e.browser] || 0) + 1;
        if (e.os) oses[e.os] = (oses[e.os] || 0) + 1;
      } else {
        const lbl = e.label || e.event;
        clicks[lbl] = (clicks[lbl] || 0) + 1;
      }
      recent.push({ ts: e.ts, event: e.event, label: e.label, path: e.path, refHost: e.refHost, src: e.utm_source });
    }
  }

  return {
    range: { days, from: files[0] ? files[0].slice(7, 17) : null, to: files.length ? files[files.length - 1].slice(7, 17) : null },
    totals: { pageviews: views, uniqueVisitors: uniqueAll.size, mobileShare: views ? Math.round((mobile / views) * 100) : 0 },
    byDay: Object.values(byDay).map((d) => ({ day: d.day, views: d.views, uniques: d.uniques.size })),
    clicks,
    topPaths: topN(paths),
    topReferrers: topN(refs),
    topSources: topN(sources),
    browsers: topN(browsers, 8),
    os: topN(oses, 8),
    recent: recent.slice(-50).reverse(),
  };
}

// constant-time token check; if no token configured, only localhost may read.
function authorized(req) {
  const provided = req.query.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!TOKEN) {
    const ip = clientIp(req);
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === '';
  }
  if (!provided || provided.length !== TOKEN.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(TOKEN)); }
  catch { return false; }
}

module.exports = { record, aggregate, authorized, DISABLED };
