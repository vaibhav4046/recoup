/* Recoup — login page logic, externalized so login.html needs no inline <script> (enables a strict CSP). */
(function () {
  const API = (window.RO_CONFIG.apiBase || "").replace(/\/+$/, "");
  const msg = (t, c) => { const m = document.getElementById("msg"); m.className = "msg " + (c || ""); m.innerHTML = t; };
  const err = new URLSearchParams(location.search).get("err");
  if (err === "expired") msg("That link expired — request a new one.", "err");
  if (err === "google") msg("Google sign-in failed — try again.", "err");

  document.getElementById("google").onclick = () => { location.href = API + "/api/auth/google/start"; };

  document.getElementById("magic").onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const captcha = window._tsToken || "";
    msg("Sending…");
    try {
      const r = await fetch(API + "/api/auth/magic/start", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, captcha }),
      });
      const d = await r.json();
      if (!r.ok) { msg(d.error || "Something went wrong.", "err"); return; }
      if (d.sent) msg("✓ Check your inbox for the sign-in link.", "ok");
      else if (d.dev_link) msg('Dev mode — <a class="devlink" href="' + d.dev_link + '">click here to sign in</a>.', "ok");
      else msg("Link sent.", "ok");
    } catch (e2) {
      msg("Backend not reachable yet — sign-in goes live once it's deployed.", "err");
    }
  };

  // configure Google + CAPTCHA from the backend's honest status
  fetch(API + "/api/auth/status").then((r) => r.json()).then((d) => {
    if (!d.providers || !d.providers.google) document.getElementById("google").style.display = "none";
    const k = d.turnstile_site_key;
    if (k) {
      window.onloadTurnstile = () => window.turnstile.render("#captcha", { sitekey: k, callback: (t) => (window._tsToken = t) });
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstile";
      s.async = true; document.head.appendChild(s);
    }
  }).catch(() => { document.getElementById("google").style.display = "none"; });
})();
