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
  var apiBase = "";
  try { apiBase = fromQuery || localStorage.getItem("RO_API_BASE") || sameOriginApi; } catch (e) { apiBase = fromQuery || sameOriginApi; }
  window.RO_CONFIG = { apiBase: apiBase.replace(/\/+$/, "") };
})();
