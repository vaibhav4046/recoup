/* Recoup — Agent Run Timeline: renders one agent run as steps
   (Plan → MCP tool call → Vector retrieval → Draft → Awaiting approval → Action link)
   + a summary card. Seeded demo data so a full run looks flawless on camera; if a live
   backend is configured it can be re-rendered from POST /api/agent/recover. */
(function () {
  "use strict";
  const mount = document.getElementById("agent-timeline");
  if (!mount) return;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const I = {
    plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    mcp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
    vector: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/></svg>',
    draft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    gate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
  };

  const API = (window.RO_CONFIG && window.RO_CONFIG.apiBase) ? window.RO_CONFIG.apiBase.replace(/\/+$/, "") : "";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // seeded reference run (mirrors POST /api/agent/recover output shape). Labelled "simulated"
  // until the live backend answers, then re-rendered from the REAL response and labelled "live".
  const SEED = {
    charge: { merchant: "FitLife Gym", kind: "dead_subscription", amount_label: "$480/yr" },
    steps: [
      { k: "plan", label: "Plan", text: "Classify the charge → retrieve a recovery playbook → draft → await your approval." },
      { k: "mcp", label: "MCP tool call", text: "<b>mongodb-mcp-server</b> &middot; inspect Atlas for the matching merchant + playbook." },
      { k: "vector", label: "Vector retrieval", text: "Atlas <b>$vectorSearch</b> → <b>“Cancel a gym / fitness membership”</b>", score: 0.86 },
      { k: "draft", label: "Draft", text: "Gemini drafts the cancellation + proration request. Amount <b>$480/yr</b> — computed by rules, not the model." },
      { k: "gate", label: "Awaiting approval", text: "<b>pending_approval</b> — nothing is sent until you tap approve." },
      { k: "link", label: "Action link", text: "Cancel-a-subscription guidance (FTC Click-to-Cancel)", link: "https://www.ftc.gov/news-events/topics/consumer-finance/negative-option-marketing" },
    ],
    summary: { waste: 1860, recovered: 720 },
    live: false,
  };

  function render(RUN) {
    const stepsHtml = RUN.steps.map((s, i) => (
      '<li class="atl-step" style="animation-delay:' + (i * 0.11).toFixed(2) + 's">' +
        '<span class="atl-dot">' + (I[s.k] || "") + '</span>' +
        '<div class="atl-body"><div class="atl-label">' + esc(s.label) +
          (s.score != null ? ' <span class="atl-score">sim ' + s.score + '</span>' : '') + '</div>' +
          '<div class="atl-text">' + s.text + (s.link ? ' <a href="' + esc(s.link) + '" class="atl-link" target="_blank" rel="noopener">open ↗</a>' : '') + '</div></div></li>'
    )).join("");

    const badge = RUN.live
      ? '<span class="atl-badge live" title="Rendered from a real POST /api/agent/recover response">● live run</span>'
      : '<span class="atl-badge sim" title="Illustrative run — connect a live backend to render a real one">simulated run</span>';

    mount.innerHTML =
      '<div class="atl-head"><h2>Agent run timeline ' + badge + '</h2>' +
      '<span class="atl-sub">plan → MCP tool → vector memory → draft → human gate</span></div>' +
      '<div class="atl-grid"><ol class="atl-steps">' + stepsHtml + '</ol>' +
      '<aside class="atl-summary"><div class="atl-charge">' + esc(RUN.charge.merchant) + ' &middot; ' + esc(RUN.charge.amount_label) + '</div>' +
      '<div class="atl-metric"><span class="atl-num" data-to="' + RUN.summary.waste + '">$0</span><span class="atl-cap">annual waste found' + (RUN.live ? ' · sample' : '') + '</span></div>' +
      '<div class="atl-metric gold"><span class="atl-num" data-to="' + RUN.summary.recovered + '">$0</span><span class="atl-cap">recovered (approved)' + (RUN.live ? ' · sample' : '') + '</span></div>' +
      '<div class="atl-foot">Atlas Vector Search &middot; MongoDB MCP &middot; Gemini + ADK</div></aside></div>';

    mount.querySelectorAll(".atl-num").forEach((n) => {
      const to = +n.getAttribute("data-to");
      if (reduce) { n.textContent = "$" + to.toLocaleString(); return; }
      let t0 = null;
      const step = (t) => { if (!t0) t0 = t; const p = Math.min(1, (t - t0) / 950); n.textContent = "$" + Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString(); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }

  render(SEED);  // instant paint, honestly labelled

  // Upgrade to a REAL run if a backend is reachable — turns the showcase genuinely live.
  if (!API) return;
  const charge = { merchant: "FitLife Gym", kind: "dead_subscription", amount: 480, amount_label: "$480/yr" };
  fetch(API + "/api/agent/recover", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ charge }),
  }).then((r) => r.ok ? r.json() : null).then((d) => {
    if (!d || !d.ok) return;
    const pb = d.playbook || {}, mcp = d.mcp || {};
    const via = pb.via === "atlas_vector_search" ? "$vectorSearch" : "vector cosine";
    const mcpText = (mcp.live && (mcp.tool_calls || []).length)
      ? '<b>mongodb-mcp-server</b> &middot; called ' + esc((mcp.tool_calls || []).join(", "))
      : (mcp.note === "mongodb_mcp_toolset_unavailable"
          ? '<b>mongodb-mcp-server</b> &middot; toolset unavailable on this deploy — Atlas queried directly via $vectorSearch.'
          : '<b>mongodb-mcp-server</b> &middot; ADK MCP toolset registered; Atlas queried via $vectorSearch.');
    render({
      charge,
      live: true,
      steps: [
        { k: "plan", label: "Plan", text: "Classify the charge → retrieve a recovery playbook → draft → await your approval." },
        { k: "mcp", label: "MCP tool call", text: mcpText },
        { k: "vector", label: "Vector retrieval", text: 'Atlas <b>' + via + '</b> → <b>“' + esc(pb.title || "recovery playbook") + '”</b>', score: pb.score != null ? Number(pb.score).toFixed(2) : null },
        { k: "draft", label: "Draft", text: 'Gemini (' + esc(d.model || "ADK") + ') drafted the recovery. Amount <b>$480/yr</b> — computed by rules, not the model.' },
        { k: "gate", label: "Awaiting approval", text: '<b>' + esc(d.status || "pending_approval") + '</b> — nothing is sent until you tap approve.' },
        { k: "link", label: "Action link", text: "Cancel-a-subscription guidance (FTC Click-to-Cancel)", link: "https://www.ftc.gov/news-events/topics/consumer-finance/negative-option-marketing" },
      ],
      summary: SEED.summary,
    });
  }).catch(() => {});
})();
