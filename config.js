/* Recoup runtime config — Cloud Run first.
   After deploying the backend, either set RO_API_BASE in localStorage or visit:
   /?api=https://YOUR-CLOUD-RUN-SERVICE-URL.run.app */
(function () {
  var fromQuery = "";
  try {
    fromQuery = new URLSearchParams(location.search).get("api") || "";
    if (fromQuery) localStorage.setItem("RO_API_BASE", fromQuery.replace(/\/+$/, ""));
  } catch (e) {}
  var sameOriginApi = /\.run\.app$/i.test(location.hostname) ? location.origin : "";
  // until the Cloud Run URL exists, non-run.app hosts (Vercel preview) fall back to the live Space backend
  var fallbackApi = "https://vaibhav3313-recoup.hf.space";
  var apiBase = "";
  try { apiBase = fromQuery || localStorage.getItem("RO_API_BASE") || sameOriginApi || fallbackApi; } catch (e) { apiBase = fromQuery || sameOriginApi || fallbackApi; }
  window.RO_CONFIG = { apiBase: apiBase.replace(/\/+$/, "") };
})();
