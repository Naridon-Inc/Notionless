// Optional account gate for the self-hosted web app.
//
// The relay tells us (via GET /api/account/config) whether this instance runs
// with accounts on. If it doesn't, this resolves immediately and the app loads
// exactly as before (pure zero-account). If it does and the visitor isn't signed
// in, we show a sign-in / sign-up card and only resolve once they authenticate.
//
// This is an ACCESS gate, not a crypto layer: signing in proves you may use this
// instance. Your notes are still E2EE and you still join teams with the team
// password — the server account can never read your content. (See accounts.js.)
//
// Dependency-free and self-contained (inline styles), because it runs BEFORE the
// app bundle/CSS loads. All requests are same-origin (the web app and relay share
// one origin behind the proxy), so the HttpOnly session cookie just works.

async function getJSON(url, opts) {
  const res = await fetch(url, { credentials: 'same-origin', ...opts });
  let body = null;
  try { body = await res.json(); } catch (e) { /* empty */ }
  return { ok: res.ok, status: res.status, body };
}

// Returns when the visitor may proceed. Never throws — if the accounts API is
// unreachable (e.g. local dev with no relay at this origin), we assume accounts
// are off and let the app load.
export async function ensureAccount() {
  let config;
  try {
    const r = await getJSON('/api/account/config');
    config = r.ok ? r.body : null;
  } catch (e) {
    config = null;
  }
  if (!config || !config.enabled) return; // accounts off → no gate

  // Already signed in?
  try {
    const me = await getJSON('/api/account/me');
    if (me.ok) return;
  } catch (e) { /* fall through to the gate */ }

  await renderGate(config);
}

const ERRORS = {
  invalid_email: 'That email address looks off.',
  weak_password: 'Use at least 8 characters.',
  email_taken: 'An account with that email already exists. Try signing in.',
  signup_closed: 'Sign-ups are closed on this instance. Ask an admin to add you.',
  invalid_credentials: 'Email or password is incorrect.',
  accounts_disabled: 'Accounts are not enabled here.',
};

function renderGate(config) {
  return new Promise((resolve) => {
    const host = (typeof window !== 'undefined' && window.location && window.location.host) || 'this instance';
    // Bootstrap: if there are no users yet, the very first sign-up creates the
    // admin — lead with "create account" and say so.
    const bootstrapping = config.signupAllowed && !config.hasUsers;
    let mode = bootstrapping || config.signupAllowed ? 'signup' : 'login';
    if (!config.signupAllowed) mode = 'login';

    const wrap = document.createElement('div');
    wrap.setAttribute('data-nl-account-gate', '');
    wrap.innerHTML = `
      <style>
        [data-nl-account-gate]{position:fixed;inset:0;z-index:99999;display:flex;
          align-items:center;justify-content:center;padding:24px;
          background:radial-gradient(1200px 800px at 50% -10%,#0f2a22 0%,#0a1714 55%,#070f0d 100%);
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
          color:#e8f3ee;}
        [data-nl-account-gate] .nl-card{width:100%;max-width:380px;
          background:rgba(18,32,28,.82);border:1px solid rgba(120,200,170,.16);
          border-radius:16px;padding:28px 26px 24px;backdrop-filter:blur(8px);
          box-shadow:0 24px 60px -20px rgba(0,0,0,.6);}
        [data-nl-account-gate] .nl-brand{display:flex;align-items:center;gap:10px;
          font-weight:650;font-size:17px;letter-spacing:.2px;margin-bottom:4px;}
        [data-nl-account-gate] .nl-dot{width:22px;height:22px;border-radius:7px;
          background:linear-gradient(150deg,#4ade9f,#1f8f6b);display:inline-block;}
        [data-nl-account-gate] .nl-sub{color:#9fc0b4;font-size:13px;margin:2px 0 20px;}
        [data-nl-account-gate] label{display:block;font-size:12px;color:#a9c8bd;
          margin:0 0 6px;}
        [data-nl-account-gate] input{width:100%;box-sizing:border-box;padding:11px 12px;
          margin-bottom:14px;border-radius:10px;border:1px solid rgba(120,200,170,.22);
          background:rgba(8,18,15,.7);color:#eaf5f0;font-size:14px;outline:none;}
        [data-nl-account-gate] input:focus{border-color:#37b88a;
          box-shadow:0 0 0 3px rgba(55,184,138,.15);}
        [data-nl-account-gate] button.nl-go{width:100%;padding:11px 14px;border:0;
          border-radius:10px;background:linear-gradient(150deg,#3ed598,#1f9f74);
          color:#06231a;font-weight:650;font-size:14px;cursor:pointer;margin-top:2px;}
        [data-nl-account-gate] button.nl-go:disabled{opacity:.6;cursor:default;}
        [data-nl-account-gate] .nl-alt{margin-top:14px;font-size:13px;color:#9fc0b4;
          text-align:center;}
        [data-nl-account-gate] .nl-alt a{color:#5fe0aa;cursor:pointer;text-decoration:none;}
        [data-nl-account-gate] .nl-err{min-height:16px;color:#ff9b9b;font-size:12.5px;
          margin:-4px 0 12px;}
        [data-nl-account-gate] .nl-foot{margin-top:18px;font-size:11.5px;color:#6f8c82;
          text-align:center;line-height:1.5;}
      </style>
      <form class="nl-card" autocomplete="on">
        <div class="nl-brand"><span class="nl-dot"></span> Notionless</div>
        <div class="nl-sub" data-sub></div>
        <label>Email</label>
        <input name="email" type="email" autocomplete="username" required />
        <label>Password</label>
        <input name="password" type="password" autocomplete="current-password" required minlength="8" />
        <div class="nl-err" data-err></div>
        <button class="nl-go" type="submit" data-go></button>
        <div class="nl-alt" data-alt></div>
        <div class="nl-foot">Your notes stay end-to-end encrypted. This sign-in only
          controls access to this instance — it can never read your content.</div>
      </form>`;

    document.body.appendChild(wrap);
    const form = wrap.querySelector('form');
    const subEl = wrap.querySelector('[data-sub]');
    const errEl = wrap.querySelector('[data-err]');
    const goEl = wrap.querySelector('[data-go]');
    const altEl = wrap.querySelector('[data-alt]');
    const emailEl = form.querySelector('input[name=email]');
    const passEl = form.querySelector('input[name=password]');

    function paint() {
      const signup = mode === 'signup';
      subEl.textContent = signup
        ? (bootstrapping ? `Create the first (admin) account for ${host}.` : `Create your account on ${host}.`)
        : `Sign in to ${host}.`;
      goEl.textContent = signup ? 'Create account' : 'Sign in';
      passEl.autocomplete = signup ? 'new-password' : 'current-password';
      // Only offer the toggle to signup when the instance allows it.
      if (config.signupAllowed && !bootstrapping) {
        altEl.innerHTML = signup
          ? 'Already have an account? <a data-toggle>Sign in</a>'
          : 'Need an account? <a data-toggle>Create one</a>';
        const t = altEl.querySelector('[data-toggle]');
        if (t) t.onclick = () => { mode = signup ? 'login' : 'signup'; errEl.textContent = ''; paint(); };
      } else {
        altEl.textContent = '';
      }
      errEl.textContent = '';
    }
    paint();
    setTimeout(() => emailEl.focus(), 30);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailEl.value.trim();
      const password = passEl.value;
      if (!email || !password) return;
      goEl.disabled = true;
      errEl.textContent = '';
      const path = mode === 'signup' ? '/api/account/signup' : '/api/account/login';
      try {
        const r = await getJSON(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (r.ok) {
          wrap.remove();
          resolve();
          return;
        }
        errEl.textContent = ERRORS[r.body && r.body.error] || 'Something went wrong. Try again.';
      } catch (err) {
        errEl.textContent = 'Could not reach the server. Check your connection.';
      }
      goEl.disabled = false;
    });
  });
}
