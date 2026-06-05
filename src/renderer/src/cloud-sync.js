// In-app control for "always-on cloud sync" (the online self-host mode).
//
// A full-online self-host instance sets Config.CLOUD_SYNC_URL (the bundle default
// is "/yjs"), so every doc ALSO mirrors its ENCRYPTED state to the always-on box
// — see p2p.js `_connectCloudMirror`. That box keeps notes available 24/7 and
// relays realtime collab even when no teammate is online; it only ever holds
// ciphertext keyed by a hashed room name.
//
// This module is the user-facing switch + status for that mode. It lets someone
// on an online instance drop THEIR OWN client back to pure peer-to-peer at
// runtime (no rebuild), and explains what each mode means. The flag it writes
// (`notionless_cloud_sync_disabled`) is read by p2p.js before it attaches the
// cloud provider. Pure DOM, no framework — matches the rest of the renderer.
import { Config } from './config'

const DISABLED_KEY = 'notionless_cloud_sync_disabled'

// Is this build/instance pointed at an always-on box at all?
export function cloudConfigured() {
  try { return !!(Config && Config.CLOUD_SYNC_URL) } catch (_e) { return false }
}

// Configured AND the user hasn't opted their client out.
export function cloudEnabled() {
  if (!cloudConfigured()) return false
  try { return localStorage.getItem(DISABLED_KEY) !== '1' } catch (_e) { return true }
}

export function setCloudEnabled(on) {
  try {
    if (on) localStorage.removeItem(DISABLED_KEY)
    else localStorage.setItem(DISABLED_KEY, '1')
  } catch (_e) { /* localStorage may be unavailable */ }
}

// Title text for the per-team sync dot, accounting for always-on mode.
export function syncDotTitle({ live, others }) {
  if (cloudEnabled()) {
    return 'Always-on cloud sync — your notes stay available 24/7 (encrypted on your box)'
  }
  return live
    ? `${others} teammate${others === 1 ? '' : 's'} online — syncing`
    : 'No teammates online — changes sync when someone connects'
}

// Color for the per-team sync dot. Always-on = a steady blue (distinct from the
// peer-presence green so the two states read differently at a glance).
export function syncDotColor({ live }) {
  if (cloudEnabled()) return '#3b82f6'
  return live ? '#3aa757' : '#c9c9c9'
}

let _openPopover = null

// Open a small popover anchored to `anchorEl` (the sync dot) with the toggle.
export function openSyncPopover(anchorEl) {
  if (_openPopover) { _openPopover.remove(); _openPopover = null; return }

  const configured = cloudConfigured()
  const enabled = cloudEnabled()
  let url = ''
  try { url = String((Config && Config.CLOUD_SYNC_URL) || '') } catch (_e) { /* ignore */ }

  const pop = document.createElement('div')
  pop.setAttribute('role', 'dialog')
  pop.style.cssText = [
    'position:fixed', 'z-index:99999', 'width:288px', 'background:#fff',
    'border:1px solid #e4e4e7', 'border-radius:10px',
    'box-shadow:0 8px 30px rgba(0,0,0,0.16)', 'padding:14px 14px 12px',
    'font-size:12.5px', 'color:#27272a', 'line-height:1.5',
  ].join(';')

  const titleRow = configured
    ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">
         <div style="font-weight:600;font-size:13px;">Always-on cloud sync</div>
         <button class="cs-switch" aria-pressed="${enabled}" style="
           position:relative;width:38px;height:22px;border:none;border-radius:999px;cursor:pointer;
           background:${enabled ? '#3b82f6' : '#d4d4d8'};transition:background .15s;flex-shrink:0;">
           <span style="position:absolute;top:2px;left:${enabled ? '18px' : '2px'};width:18px;height:18px;
             border-radius:50%;background:#fff;transition:left .15s;box-shadow:0 1px 2px rgba(0,0,0,.3);"></span>
         </button>
       </div>`
    : `<div style="font-weight:600;font-size:13px;margin-bottom:8px;">Sync mode</div>`

  const body = configured
    ? `<div style="color:#52525b;">
         ${enabled
           ? 'On — your notes are stored encrypted on your always-on box and stay available 24/7, even with every device closed. Realtime collaboration runs through it too.'
           : 'Off — this device is pure peer-to-peer: notes sync directly with teammates only while someone is online. Your box is not used.'}
       </div>
       ${url ? `<div style="margin-top:8px;color:#a1a1aa;font-size:11px;word-break:break-all;">Box: <code>${url.replace(/</g, '&lt;')}</code></div>` : ''}
       <div style="margin-top:9px;color:#a1a1aa;font-size:11px;">The box only ever holds ciphertext — it can never read your notes.</div>`
    : `<div style="color:#52525b;">
         This app is <b>pure peer-to-peer</b>: notes sync directly between devices, end-to-end encrypted, with nothing stored on a server.
       </div>
       <div style="margin-top:8px;color:#52525b;">
         Want notes available 24/7 (a Notion-style online app on your own domain)? <b>Self-host the full online stack</b> on your own box.
       </div>
       <div style="margin-top:8px;"><a href="https://github.com/Naridon-Inc/Notionless/blob/master/docs/SELF_HOSTING.md" target="_blank" rel="noopener" style="color:#3b82f6;text-decoration:none;">How to self-host →</a></div>`

  pop.innerHTML = titleRow + body
  document.body.appendChild(pop)

  // Position under the anchor, kept within the viewport.
  const r = anchorEl.getBoundingClientRect()
  const top = Math.min(r.bottom + 8, window.innerHeight - pop.offsetHeight - 12)
  const left = Math.min(Math.max(8, r.right - pop.offsetWidth), window.innerWidth - pop.offsetWidth - 8)
  pop.style.top = `${Math.max(8, top)}px`
  pop.style.left = `${left}px`

  const sw = pop.querySelector('.cs-switch')
  if (sw) sw.onclick = () => {
    setCloudEnabled(!cloudEnabled())
    // Reload so every open doc re-runs `_connectCloudMirror` with the new choice.
    location.reload()
  }

  const onDocClick = (ev) => {
    if (pop.contains(ev.target) || ev.target === anchorEl) return
    close()
  }
  const onKey = (ev) => { if (ev.key === 'Escape') close() }
  function close() {
    document.removeEventListener('mousedown', onDocClick, true)
    document.removeEventListener('keydown', onKey, true)
    if (_openPopover === pop) _openPopover = null
    pop.remove()
  }
  // Defer wiring so the opening click doesn't immediately dismiss it.
  setTimeout(() => {
    document.addEventListener('mousedown', onDocClick, true)
    document.addEventListener('keydown', onKey, true)
  }, 0)
  _openPopover = pop
  return pop
}
