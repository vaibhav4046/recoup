/* Recoup — login page logic, externalized so login.html needs no inline <script> (enables a strict CSP). */
(function () {
  const API = (window.RO_CONFIG.apiBase || "").replace(/\/+$/, "");
  const msg = (t, c) => { const m = document.getElementById("msg"); m.className = "msg " + (c || ""); m.innerHTML = t; };
  const googleBtn = document.getElementById("google");
  const magicForm = document.getElementById("magic");
  const divider = document.querySelector(".divider");

  const err = new URLSearchParams(location.search).get("err");
  if (err === "expired") msg("That link expired — request a new one.", "err");
  if (err === "google") msg("Google sign-in failed — try again.", "err");
  if (err === "state") msg("That sign-in attempt expired — just try again.", "err");

  // Email sign-in is off until /api/auth/status confirms a mail provider, so we hide it by
  // default and lead with Google. This holds even if the status fetch is blocked/unreachable.
  function hideMagic() { if (magicForm) magicForm.style.display = "none"; if (divider) divider.textContent = "Google sign-in — one tap, no password"; }
  function showMagic() { if (magicForm) magicForm.style.display = ""; if (divider) divider.textContent = "or use a magic link"; }
  hideMagic();

  // Continue with Google is ALWAYS available: it's a top-level navigation to the backend's OAuth
  // start (not a fetch), so it works even when a cross-origin /api/auth/status probe is blocked.
  // The backend returns 503 only if OAuth isn't configured — which it is on the live deployment.
  if (googleBtn) googleBtn.onclick = () => { location.href = API + "/api/auth/google/start"; };

  function applyStatus(d) {
    if (d && d.providers && d.providers.magic_link_email) showMagic(); else hideMagic();
    // only hide Google if the backend EXPLICITLY reports it unconfigured; never hide on a failed probe
    if (d && d.providers && d.providers.google === false && googleBtn) googleBtn.style.display = "none";
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
      .catch(() => null); // never hide the Google button just because a cross-origin probe failed
  }

  if (magicForm) magicForm.onsubmit = async (e) => {
    e.preventDefault();
    const email = (document.getElementById("email").value || "").trim();
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
      msg("Backend not reachable — use <b>Continue with Google</b> or the no-account <a href=\"/\">paste scan</a>.", "err");
    }
  };

  loadStatus();
})();
