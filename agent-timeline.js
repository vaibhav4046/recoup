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

  // seeded demo run (mirrors POST /api/agent/recover output shape)
  const RUN = {
    charge: { merchant: "FitLife Gym", kind: "dead_subscription", amount_label: "$480/yr" },
    steps: [
      { k: "plan", label: "Plan", text: "Classify the charge → retrieve a recovery playbook → draft → await your approval." },
      { k: "mcp", label: "MCP tool call", text: "<b>mongodb-mcp-server</b> &middot; find · merchant “FitLife Gym” → 3 recurring charges in Atlas." },
      { k: "vector", label: "Vector retrieval", text: "Atlas <b>$vectorSearch</b> → <b>“Cancel a gym / fitness membership”</b>", score: 0.86 },
      { k: "draft", label: "Draft", text: "Gemini drafted the cancellation + proration request. Amount <b>$480/yr</b> — computed by rules, not the model." },
      { k: "gate", label: "Awaiting approval", text: "<b>pending_approval</b> — nothing is sent until you tap approve." },
      { k: "link", label: "Action link", text: "Open the gym’s cancellation portal", link: "#" },
    ],
    summary: { waste: 1860, recovered: 720 },
  };

  const stepsHtml = RUN.steps.map((s, i) => (
    '<li class="atl-step" style="animation-delay:' + (i * 0.11).toFixed(2) + 's">' +
      '<span class="atl-dot">' + (I[s.k] || "") + '</span>' +
      '<div class="atl-body"><div class="atl-label">' + s.label +
        (s.score != null ? ' <span class="atl-score">sim ' + s.score + '</span>' : '') + '</div>' +
        '<div class="atl-text">' + s.text + (s.link ? ' <a href="' + s.link + '" class="atl-link">open ↗</a>' : '') + '</div></div></li>'
  )).join("");

  mount.innerHTML =
    '<div class="atl-head"><h2>Agent run timeline</h2>' +
    '<span class="atl-sub">plan → MCP tool → vector memory → draft → human gate</span></div>' +
    '<div class="atl-grid"><ol class="atl-steps">' + stepsHtml + '</ol>' +
    '<aside class="atl-summary"><div class="atl-charge">' + RUN.charge.merchant + ' &middot; ' + RUN.charge.amount_label + '</div>' +
    '<div class="atl-metric"><span class="atl-num" data-to="' + RUN.summary.waste + '">$0</span><span class="atl-cap">annual waste found</span></div>' +
    '<div class="atl-metric gold"><span class="atl-num" data-to="' + RUN.summary.recovered + '">$0</span><span class="atl-cap">recovered (approved)</span></div>' +
    '<div class="atl-foot">Atlas Vector Search &middot; MongoDB MCP &middot; Gemini + ADK</div></aside></div>';

  mount.querySelectorAll(".atl-num").forEach((n) => {
    const to = +n.getAttribute("data-to");
    if (reduce) { n.textContent = "$" + to.toLocaleString(); return; }
    let t0 = null;
    const step = (t) => { if (!t0) t0 = t; const p = Math.min(1, (t - t0) / 950); n.textContent = "$" + Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString(); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
})();
