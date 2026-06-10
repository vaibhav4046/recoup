/* Recoup runtime config — Cloud Run first.
   The backend is chosen from a fixed allowlist only. A ?api= override (persisted to
   localStorage) is honored ONLY if it points at an allowlisted backend origin — this
   prevents a poisoned ?api= link from redirecting credentialed/Gmail-handoff calls to
   an attacker origin. On a same-origin Cloud Run host the API is always the origin itself. */
(function () {
  // Trusted backend = the Google Cloud Run service (serves frontend + API same-origin).
  // Google-only stack per hackathon rules; no non-Google / competing host is used.
  var ALLOW = [
    "https://recoup-agent-681822930558.us-central1.run.app",
  ];
  var FALLBACK = "https://recoup-agent-681822930558.us-central1.run.app";

  function clean(u) { return (u || "").replace(/\/+$/, ""); }
  function originOf(u) { try { return new URL(u).origin; } catch (e) { return ""; } }
  function allowed(u) {
    var o = originOf(clean(u));
    if (!o) return false;
    if (o === location.origin) return true;                 // same-origin Cloud Run host
    return ALLOW.indexOf(o) !== -1;
  }

  var sameOriginApi = /\.run\.app$/i.test(location.hostname) ? location.origin : "";

  // ?api= override: accept ONLY if it resolves to an allowlisted backend; store the bare ORIGIN
  // (never a path) so a trailing path can't silently break every /api/* call. Otherwise ignore + purge.
  var fromQuery = "";
  try {
    var raw = clean(new URLSearchParams(location.search).get("api") || "");
    if (raw && allowed(raw)) { fromQuery = originOf(raw); localStorage.setItem("RO_API_BASE", fromQuery); }
    else if (raw) { localStorage.removeItem("RO_API_BASE"); }  // reject a poisoned link, don't persist it
  } catch (e) {}

  var stored = "";
  try {
    stored = originOf(clean(localStorage.getItem("RO_API_BASE") || ""));
    if (stored && !allowed(stored)) { localStorage.removeItem("RO_API_BASE"); stored = ""; }
  } catch (e) {}

  // On a production Cloud Run host, pin to the origin regardless of any stored value.
  var apiBase = sameOriginApi || fromQuery || stored || FALLBACK;
  window.RO_CONFIG = { apiBase: clean(apiBase) };
})();
