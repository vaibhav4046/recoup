/* Recoup — login page logic, externalized so login.html needs no inline <script> (enables a strict CSP). */
(function () {
  const API = (window.RO_CONFIG.apiBase || "").replace(/\/+$/, "");
  let _signinReady = false;
  let _statusLoaded = false;
  const msg = (t, c) => { const m = document.getElementById("msg"); m.className = "msg " + (c || ""); m.innerHTML = t; };
  const err = new URLSearchParams(location.search).get("err");
  if (err === "expired") msg("That link expired — request a new one.", "err");
  if (err === "google") msg("Google sign-in failed — try again.", "err");
  if (err === "state") msg("That sign-in attempt expired — just try again.", "err");

  function applyStatus(d) {
    _statusLoaded = true;
    _signinReady = !!(d && d.signin_ready);
    const canEmail = !!(d && d.providers && d.providers.magic_link_email);
    // honesty by construction: never show a path that can't succeed.
    const magic = document.getElementById("magic");
    const divider = document.querySelector(".divider");
    if (!canEmail) {
      if (magic) magic.style.display = "none";
      if (divider) { divider.textContent = "email sign-in coming soon — Google works now"; }
    } else {
      if (magic) magic.style.display = "";
      if (divider) divider.textContent = "or use a magic link";
    }
    if (!d || !d.providers || !d.providers.google) document.getElementById("google").style.display = "none";
    const k = d && d.turnstile_site_key;
    if (k && !window._tsLoaded) {
      window._tsLoaded = true;
      window.onloadTurnstile = () => window.turnstile.render("#captcha", { sitekey: k, callback: (t) => (window._tsToken = t) });
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstile";
      s.async = true; document.head.appendChild(s);
    }
  }
  function loadStatus() {
    return fetch(API + "/api/auth/status").then((r) => r.json()).then((d) => { applyStatus(d); return d; })
      .catch(() => { document.getElementById("google").style.display = "none"; return null; });
  }

  document.getElementById("google").onclick = async () => {
    if (!_signinReady && !_statusLoaded) { msg("Waking the backend…", "ok"); await loadStatus(); } // never gate on a stale flag
    if (!_signinReady) { msg('Backend is still waking up — try again in a few seconds, or use the no-sign-in <a href="/">paste scan</a>.', "ok"); return; }
    location.href = API + "/api/auth/google/start";
  };

  document.getElementById("magic").onsubmit = async (e) => {
    e.preventDefault();
    if (!_signinReady) { await loadStatus(); }
    if (!_signinReady) { msg('Backend is still waking up — try again in a few seconds, or use the no-sign-in <a href="/">paste scan</a>.', "ok"); return; }
    const email = document.getElementById("email").value.trim();
    const captcha = window._tsToken || "";
    msg("Sending…");
    try {
      const r = await fetch(API + "/api/auth/magic/start", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, captcha }),
      });
      const d = await r.json();
      if (!r.ok) { msg(d.error || "Something went wrong.", "err"); return; }
      if (d.sent) msg("Check your inbox for the sign-in link.", "ok");
      else if (d.dev_link) msg('Dev mode — <a class="devlink" href="' + d.dev_link + '">click here to sign in</a>.', "ok");
      else msg('Email sign-in isn\'t enabled on this demo — use <b>Continue with Google</b> or the no-account <a href="/">paste scan</a>.', "ok");
    } catch (e2) {
      msg("Backend not reachable — try again in a few seconds.", "err");
    }
  };

  loadStatus();
})();
