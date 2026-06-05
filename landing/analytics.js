/*!
 * Notionless — first-party, privacy-respecting page analytics (no cookies, no
 * third parties, no fingerprinting). Sends a tiny anonymous beacon to our own
 * relay so we can see pageviews, referrers (e.g. Product Hunt), and download
 * clicks. Honors Do Not Track. ~1KB, no dependencies.
 *
 * Endpoint defaults to same-origin /api/collect (the page is served by the relay
 * at oss.naridon.com). If you serve the landing from a different host, set
 *   window.__ANALYTICS_ENDPOINT = 'https://oss.naridon.com/api/collect';
 * before this script loads.
 */
(function () {
  'use strict';

  // Respect Do Not Track and an explicit local opt-out.
  var dnt = navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.msDoNotTrack === '1';
  try { if (localStorage.getItem('nl-analytics-opt-out') === '1') dnt = true; } catch (e) {}
  if (dnt) return;

  var ENDPOINT = window.__ANALYTICS_ENDPOINT || '/api/collect';

  function qp(name) {
    try { return new URLSearchParams(location.search).get(name) || undefined; } catch (e) { return undefined; }
  }

  function send(payload) {
    payload.path = location.pathname || '/';
    payload.ref = document.referrer || undefined;
    payload.utm_source = qp('utm_source') || qp('ref');
    payload.utm_medium = qp('utm_medium');
    payload.utm_campaign = qp('utm_campaign');
    payload.screen = (screen.width || 0) + 'x' + (screen.height || 0);
    payload.viewport = (window.innerWidth || 0) + 'x' + (window.innerHeight || 0);
    payload.lang = navigator.language;
    try { payload.tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}

    var body = JSON.stringify(payload);
    // text/plain keeps it a CORS "simple" request (no preflight) cross-origin.
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }));
        return;
      }
    } catch (e) {}
    try {
      fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain' }, mode: 'cors' });
    } catch (e) {}
  }

  // 1) pageview
  send({ event: 'pageview' });

  // 2) outbound / CTA click tracking — download, GitHub, etc.
  //    Tag any element with data-track="<label>", or we infer from the href.
  function labelFor(a) {
    var explicit = a.getAttribute('data-track');
    if (explicit) return explicit;
    var href = (a.getAttribute('href') || '').toLowerCase();
    if (/releases|\.dmg|download/.test(href)) return 'download';
    if (/github\.com/.test(href)) return 'github';
    if (/producthunt\.com/.test(href)) return 'producthunt';
    if (/^mailto:/.test(href)) return 'email';
    return null;
  }

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    var label = labelFor(a);
    if (!label) return;
    send({ event: 'click', label: label });
  }, { capture: true, passive: true });
})();
