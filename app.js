/* Recoup — frontend logic. Live backend overlay or standalone fallback. */
(function () {
  "use strict";
  const cfg = window.RO_CONFIG || { apiBase: "" };
  const API = (cfg.apiBase || "").replace(/\/+$/, "");
  const LEAK = new Set(["dead_subscription", "price_creep", "billing_error"]);
  const RULES = {
    eu261: "EU261/UK261 — 3h+ delay owes €250–€600 cash.",
    dead_sub: "Unused 60+ days — recurring leak, cancel + prorate.",
    price_creep: "Silent price hike — challenge or match new-customer rate.",
    billing_error: "Duplicate/undisclosed fee — chargeback eligible.",
    settlement: "Open class-action settlement — file to get paid.",
    unclaimed: "State unclaimed-property (NAUPA) held in your name.",
    refund_window: "Price-protection / refund window owed back.",
    warranty: "Active warranty / protection plan — repair at no cost.",
    deposit: "Security deposit overdue past the statutory return window.",
  };
  const PLAIN = {
    dead_subscription: "You're paying every month for something you stopped using. Cancelling stops the charge.",
    price_creep: "The price quietly went up. You can ask for your old rate — or cancel.",
    billing_error: "You were charged twice, or for a fee you didn't agree to. You can dispute it.",
    price_drop: "It got cheaper right after you bought it. Many shops refund the difference.",
    flight_comp: "Your flight was badly delayed — EU/UK law says the airline owes you cash, not a voucher.",
    settlement: "A company was fined for overcharging customers. If you were one, you can claim a share.",
    unclaimed: "A government database is holding money in your name — an old deposit, refund, or balance.",
    warranty: "Your protection plan covers this repair. You shouldn't pay out of pocket.",
    deposit: "Your landlord is past the legal deadline to return your deposit.",
  };
  let S = null;

  const $ = (s) => document.querySelector(s);
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const money = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const isLeak = (k) => LEAK.has(k);
  const currencyOf = (a) => {
    const c = String((a && a.currency) || "").trim();
    if (["$", "£", "€"].includes(c)) return c;
    const m = String((a && a.amount_label) || "").trim().match(/^([$£€])/);
    return m ? m[1] : "$";
  };
  const currencySummary = (items) => {
    const set = [...new Set((items || []).map(currencyOf).filter(Boolean))];
    if (!set.length) return { symbol: "$", mixed: false };
    return set.length === 1 ? { symbol: set[0], mixed: false } : { symbol: "≈$", mixed: true };
  };
  const moneyWithCurrency = (n, cur, suffix) => `${cur.symbol}${money(n)}${suffix || ""}`;
  // honest per-currency totals — NEVER blend $ and € into one figure
  const perCurrency = (items) => {
    const by = {};
    (items || []).forEach((a) => { const c = currencyOf(a); by[c] = r2((by[c] || 0) + (a.amount || 0)); });
    return by;
  };
  const fmtCurrencies = (by, suffix) => {
    const curs = Object.keys(by).sort((x, y) => by[y] - by[x]);
    return curs.length ? curs.map((c) => `${c}${money(by[c])}${suffix || ""}`).join(" + ") : "$0";
  };

  /* real SHA-256 (Web Crypto) — 64-char hex, chained like the backend's audit.py */
  async function sha256(str) {
    try {
      if (typeof crypto !== "undefined" && crypto.subtle) {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
        return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
      }
    } catch (e) { /* non-secure context (file:// or http://) — fall through to a non-crypto digest */ }
    let h1 = 0x811c9dc5, h2 = 0x1000193;
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0; h2 = Math.imul(h2 ^ c, 0x85ebca77) >>> 0; }
    return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).repeat(4).slice(0, 64);
  }

  async function boot() {
    try { applyTheme(localStorage.getItem("ro-theme") || "dark"); } catch (e) {}
    if (API) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000); // cold-start safety: fall back to embedded data fast
        const res = await fetch(API + "/api/state", { signal: ctrl.signal });
        const ct = res.headers.get("content-type") || "";
        if (res.ok && ct.includes("application/json")) {
          const data = await res.json();          // timer still armed — covers a slow cold-start body read
          if (data && Array.isArray(data.actions)) { S = data; S._live = true; }
        }
        clearTimeout(t);
      } catch (e) { /* cold start / HTML "starting" page / network — fall back to embedded data instantly */ }
    }
    if (!S) { S = JSON.parse(JSON.stringify(window.RO_FALLBACK || { actions: [], audit: [], reasoning: [] })); S._live = false; }
    S.actions = S.actions || []; S.audit = S.audit || []; S.reasoning = S.reasoning || [];
    // per-visitor demo: start every visitor clean — never inherit another visitor's approvals from the shared backend
    S.actions.forEach((a) => { a.approvalState = "pending"; a.status = "drafted"; });
    S.audit = [];
    recompute();
    renderAll(true);
    wire();
    // Gmail OAuth handoff: #gmail=<short-lived-token> | err. Query support remains for old callbacks.
    try {
      const gp = gmailHandoff();
      if (gp) {
        history.replaceState({}, "", location.pathname);
        if (gp === "err") toast("Gmail connect failed — try again, or use the paste scan");
        else if (gp !== "ok" && API) loadGmail(gp);
      }
    } catch (e) {}
  }

  function sumAmt(pred) { return r2(S.actions.filter(pred).reduce((s, a) => s + (a.amount || 0), 0)); }
  function recompute() {
    S.recurring_year = S.recurring_year || sumAmt((a) => a.cadence === "yearly");
    S.one_time = S.one_time || sumAmt((a) => a.cadence === "once");
    S.recoverable = S.recoverable || r2(S.recurring_year + S.one_time);
    S.ready = sumAmt((a) => a.approvalState === "approved");
  }

  function renderAll(animateTrace) {
    renderChips(); renderHero(); renderSwarm(); renderBreakdown(); renderFindings(); renderAudit();
    renderTrace(animateTrace); renderVrec();
  }

  function renderSwarm() {
    const box = $("#swarm"); if (!box) return; box.innerHTML = "";
    const roster = S.swarm || [];
    const meta = $("#swarm-meta");
    if (meta) meta.textContent = roster.length ? `${roster.length} agents · ${S.verified || 0} auto-verified${S.needs_confirm ? " · " + S.needs_confirm + " need sign-off" : ""}` : "—";
    roster.forEach((a) => {
      const c = el("div", "agent-card" + (a.count ? " active" : ""));
      c.setAttribute("role", "listitem");
      const cur = currencySummary(S.actions.filter((x) => x.agent_name === a.name)); // ≈$ if this agent aggregates >1 currency
      const stat = moneyWithCurrency(a.amount, cur);
      c.setAttribute("aria-label", `${a.name}: ${a.count} found, ${stat} recoverable`);
      c.innerHTML = `<div class="ag-top"><span class="ag-dot"></span><span class="ag-name">${esc(a.name)}</span><span class="ag-count">${a.count}</span></div>
        <div class="ag-mandate">${esc(a.mandate)}</div>
        <div class="ag-stat">${stat} recoverable</div>`;
      box.appendChild(c);
    });
  }

  function renderChips() {
    const box = $("#status-chips"); box.innerHTML = "";
    const chip = (txt, cls) => el("span", "chip " + cls, `<span class="d"></span>${txt}`);
    if (S._real) {
      box.appendChild(chip("Rules · in-browser", "live"));
      box.appendChild(chip("Private · on-device", "live"));
      box.appendChild(chip("Audit · SHA-256", "live"));
      box.appendChild(chip("Your data", "live"));
      return;
    }
    const live = S.integrations || {};
    const gem = (live.gemini || "fallback") === "live" && S._live && !!(S.run && S.run.live); // only claim "live" if the run actually used Gemini (not a 429 fallback)
    const mon = (live.mongodb || "fallback") === "live";
    box.appendChild(chip(gem ? "Gemini · live" : "AI reasoning · on", gem ? "live" : ""));
    box.appendChild(chip(mon ? "MongoDB · live" : "Storage · local", mon ? "live" : ""));
    box.appendChild(chip("Audit · SHA-256", "live"));
    box.appendChild(chip(S._live ? "Backend · live" : "Sample data", S._live ? "live" : ""));
  }

  function renderHero() {
    const onceBy = perCurrency(S.actions.filter((a) => a.cadence === "once"));
    const onceCurs = Object.keys(onceBy).sort((x, y) => onceBy[y] - onceBy[x]);
    const mainCur = onceCurs[0] || "$";
    setText("#one-time-prefix", mainCur);
    const others = onceCurs.slice(1).map((c) => `${c}${money(onceBy[c])}`);
    setText("#one-time-note", others.length ? `one-time · plus ${others.join(" + ")} owed` : "one-time payouts");
    animateCount($("#one-time"), onceBy[mainCur] || 0);
    animateCount($("#recurring"), S.recurring_year);
    const owed = S.actions.filter((a) => a.cadence === "once").length;
    const leaks = S.actions.length - owed;
    $("#hero-sub").textContent = `${S.actions.length} recoverable items — ${leaks} recurring leaks to plug, ${owed} one-time claims you're owed. Approve each; nothing sends without you.`;
    $("#findings-count").textContent = S.actions.length;
    const dn = $("#demo-note");
    if (dn) dn.innerHTML = S._real
      ? '🔒 <b>Your data</b> — scanned privately in your browser. Nothing was uploaded. <button class="linklike2" id="open-scan">Re-scan →</button>'
      : '🧪 <b>Sample inbox</b> — example data, $0 of this is yours yet. <button class="linklike2" id="open-scan">Recover your own subscriptions →</button>';
    const ob = $("#open-scan"); if (ob) ob.onclick = openScan;
    updateReadyUI();
  }

  function updateReadyUI() {
    const appr = S.actions.filter((a) => a.approvalState === "approved");
    const n = S.actions.length;
    setText("#ready-count", appr.length);
    setText("#total-count", n);
    const pendingN = S.actions.filter((a) => a.approvalState === "pending").length;
    setText("#pending-count", pendingN);
    const paid = r2(S.actions.filter((a) => a.status === "paid").reduce((s, a) => s + a.amount, 0));
    const foot = $("#ready-foot");
    if (foot) foot.innerHTML = paid > 0
      ? `<b>${fmtCurrencies(perCurrency(S.actions.filter((a) => a.status === "paid")))}</b> recovered (you confirmed) · ${pendingN} pending`
      : `<b>${fmtCurrencies(perCurrency(S.actions))}</b> recoverable · approve a claim to start`;
    const frac = n ? appr.length / n : 0;
    const C = 2 * Math.PI * 52;
    const ring = $("#ring-fg"); if (ring) ring.style.strokeDashoffset = String(C * (1 - frac));
    setText("#ring-pct", Math.round(frac * 100) + "%");
    const ringEl = document.querySelector(".ring");
    if (ringEl) ringEl.setAttribute("aria-hidden", "true");
    const rs = $("#ring-status");
    if (rs) { const msg = `${appr.length} of ${n} claims ready; ${fmtCurrencies(perCurrency(S.actions.filter((a) => a.status === "paid")))} recovered`; if (rs.textContent !== msg) rs.textContent = msg; }
  }
  function setText(sel, v) { const e = $(sel); if (e) e.textContent = v; }

  function renderTrace(animate) {
    const box = $("#trace"); box.innerHTML = "";
    const run = S.run || {};
    $("#reason-model").textContent = run.model ? `${run.model}${run.live ? " · live" : " · fallback"}${run.latency_ms ? " · " + run.latency_ms + "ms" : ""}` : "—";
    (S.reasoning || []).forEach((ln, i) => {
      const line = el("div", "line " + (ln.tone || "dim"), `<span class="mk">›</span><span class="t">${esc(ln.t)}</span>`);
      if (animate) line.style.animationDelay = (i * 0.09) + "s"; else { line.style.opacity = 1; line.style.transform = "none"; }
      box.appendChild(line);
    });
  }

  function renderBreakdown() {
    const cats = {};
    S.actions.forEach((a) => {
      const k = catLabel(a.kind);
      cats[k] = cats[k] || { amt: 0, leak: isLeak(a.kind), currencies: [] };
      cats[k].amt += a.amount || 0;
      cats[k].currencies.push(currencyOf(a));
    });
    const max = Math.max(1, ...Object.values(cats).map((c) => c.amt));
    const box = $("#breakdown"); box.innerHTML = "";
    Object.entries(cats).sort((a, b) => b[1].amt - a[1].amt).forEach(([k, c]) => {
      const row = el("div", "bd-row");
      row.innerHTML = `<div class="bd-top"><span class="nm">${k}</span><span class="vl">${moneyWithCurrency(c.amt, currencySummary(c.currencies.map((currency) => ({ currency }))), c.leak ? "/yr" : "")}</span></div><div class="bd-bar"><div class="bd-fill ${c.leak ? "leak" : ""}"></div></div>`;
      box.appendChild(row);
      requestAnimationFrame(() => { row.querySelector(".bd-fill").style.width = (c.amt / max * 100) + "%"; });
    });
  }

  function renderFindings() {
    const box = $("#findings"); box.innerHTML = "";
    S.actions.forEach((a, i) => { const c = card(a); c.style.animationDelay = (i * 0.04) + "s"; box.appendChild(c); });
  }

  function card(a) {
    const leak = isLeak(a.kind), once = a.cadence === "once";
    const st = a.status, approved = a.approvalState === "approved";
    const c = el("div", "fcard" + (approved ? " claim-ready" : a.approvalState === "rejected" ? " skipped" : "") + (once ? " fc-onetime" : "") + (st === "paid" ? " paid" : ""));
    const aid = esc(a.id);
    c.id = "card-" + aid;
    c.setAttribute("role", "listitem");
    const _kindWord = leak ? "money you're losing" : "money you're owed";
    const _stateWord = st === "paid" ? "recovered" : st === "sent" ? "claim sent" : approved ? "claim ready" : "needs your review";
    c.setAttribute("aria-label", [a.title, a.amount_label, _kindWord, a.confidence ? Math.round(a.confidence * 100) + "% confidence" : "", _stateWord].filter(Boolean).join(", "));
    const conf = a.confidence ? Math.round(a.confidence * 100) : null;
    const sendRow = `<div class="fc-send">
        <button class="btn btn-copy" data-copy="${aid}" aria-label="Copy claim text"><span aria-hidden="true">⧉</span> Copy</button>
        ${a.claim_url ? `<a class="btn btn-mail" href="${safeUrl(a.claim_url)}" target="_blank" rel="noopener" aria-label="Open official claim form">Claim form <span aria-hidden="true">↗</span></a>` : `<button class="btn btn-mail" data-mail="${aid}" aria-label="Email claim draft"><span aria-hidden="true">✉</span> Email</button>`}
      </div>`;
    let actions;
    if (a.approvalState === "rejected") {
      actions = `<div class="fc-actions"><button class="btn btn-approve" data-approve="${aid}"><span aria-hidden="true">✓</span> Approve instead</button><button class="btn btn-view" data-view="${aid}">Show work</button></div>`;
    } else if (!approved) {
      actions = `<div class="fc-actions">
           <button class="btn btn-approve" data-approve="${aid}"><span aria-hidden="true">✓</span> Approve</button>
           <button class="btn btn-view" data-view="${aid}">Show work</button>
           <button class="btn btn-skip" data-skip="${aid}">Skip</button>
         </div>`;
    } else if (st === "paid") {
      actions = `<div class="fc-paid"><span aria-hidden="true">✓</span> Recovered ${esc(a.amount_label)}</div>`;
    } else if (st === "sent") {
      actions = `${sendRow}<button class="btn btn-life paid full" data-paid="${aid}"><span aria-hidden="true">💰</span> Mark recovered</button>`;
    } else {
      actions = `${sendRow}<button class="btn btn-life full" data-sent="${aid}">Mark sent →</button>`;
    }
    const tag = approved
      ? `<span class="fc-kind ready">${st === "paid" ? '<span aria-hidden="true">✓</span> paid' : st === "sent" ? "sent" : '<span aria-hidden="true">✓</span> ready'}</span>`
      : `<span class="fc-kind ${leak ? "leak" : "owed"}">${once ? "owed" : "leak"}</span>`;
    c.innerHTML = `
      <div class="fc-top">
        <div class="fc-title">${esc(a.title)}</div>
        <div class="fc-tags">
          ${conf ? `<span class="fc-conf ${esc(a.confidence_band || "")}" title="confidence the rule applies">${conf}%</span>` : ""}
          ${tag}
        </div>
      </div>
      <div class="fc-amount">${esc(a.amount_label)} <small>· ${esc(a.unit_note)}</small></div>
      <div class="fc-ev">${esc(a.evidence)}</div>
      <div class="fc-rule">${esc(RULES[a.rule] || a.rule)}</div>
      ${a.timeline ? `<div class="fc-expect"><span aria-hidden="true">⏱</span> ${esc(a.timeline)} · <b>${esc(a.odds || "")}</b> to land</div>` : ""}
      ${a.agent_name ? `<div class="fc-agent"><span aria-hidden="true">◆</span> ${esc(a.agent_name)}${a.verify ? (a.verify.needs_confirm ? ` · <span class="needs-confirm"><span aria-hidden="true">⚠</span> confirm eligibility</span>` : (a.verify.ok ? " · verified" : "")) : ""} · <button class="linklike" data-view="${aid}">show work</button></div>` : ""}
      ${actions}`;
    return c;
  }

  function renderAudit() {
    const box = $("#audit"); box.innerHTML = "";
    (S.audit || []).slice(-9).forEach((e) => {
      const row = el("div", "au-row");
      row.innerHTML = `<span class="au-actor ${e.actor_type}">${esc(e.actor_name || e.actor_type)}</span>
        <span class="au-label">${esc(e.label)}</span>
        <span class="au-hash">${(e.hash || "").slice(0, 10)}…</span>`;
      box.appendChild(row);
    });
    const badge = $("#audit-badge");
    badge.className = "audit-badge ok";
    badge.textContent = `● SHA-256 hash-chained · ${(S.audit || []).length} events`;
  }

  // ---- actions ----
  // serialize audit appends so rapid/concurrent clicks on different cards can't interleave at
  // the await and corrupt the SHA-256 chain (duplicate event_id / wrong prev_hash). Each append
  // reads prev_hash + event_id INSIDE the queued continuation, after the previous one has pushed.
  let _auditQ = Promise.resolve();
  function appendAudit(actor_type, actor_name, event_type, label, amount) {
    const run = async () => {
      const prev = S.audit.length ? S.audit[S.audit.length - 1].hash : "0".repeat(64);
      const e = { event_id: "au_" + String(S.audit.length + 1).padStart(4, "0"), actor_type, actor_name, event_type, label, amount: amount || 0, prev_hash: prev };
      e.hash = await sha256(prev + JSON.stringify(e));
      S.audit.push(e);
    };
    _auditQ = _auditQ.then(run, run); // run regardless of a prior rejection so the queue never poisons
    return _auditQ;
  }

  function demoBlocked() {
    if (!demoRunning || demoInternal) return false;
    toast("Demo walkthrough is running — wait for it to finish");
    return true;
  }

  async function approve(id, fromDemo) {
    if (!fromDemo && demoBlocked()) return;
    const a = S.actions.find((x) => x.id === id); if (!a || a.approvalState === "approved") return;
    a.approvalState = "approved"; a.status = "claim_ready"; a.claimedAt = new Date().toISOString?.() || "now";
    await appendAudit("human", "You", "ACTION_APPROVED", "Approved (claim ready): " + a.title, a.amount);
    recompute(); renderHero(); renderBreakdown(); renderAudit();
    const c = $("#card-" + id); if (c) { c.outerHTML = card(a).outerHTML; const nc = $("#card-" + id); if (nc) nc.style.animation = "none"; }
    toast(`Claim drafted — ready to send: ${a.title}`);
  }

  async function skip(id) {
    if (demoBlocked()) return;
    const a = S.actions.find((x) => x.id === id); if (!a) return;
    a.approvalState = "rejected"; a.status = "drafted";
    await appendAudit("human", "You", "ACTION_REJECTED", "Skipped: " + a.title);
    recompute(); renderHero(); renderBreakdown(); renderAudit();
    const c = $("#card-" + id); if (c) { c.outerHTML = card(a).outerHTML; const nc = $("#card-" + id); if (nc) nc.style.animation = "none"; }
    if ($("#drawer").classList.contains("open")) closeDrawer();
  }

  async function markSent(id, fromDemo) {
    if (!fromDemo && demoBlocked()) return;
    const a = S.actions.find((x) => x.id === id); if (!a || a.approvalState !== "approved") return;
    a.status = "sent";
    await appendAudit("human", "You", "CLAIM_SENT", "Claim sent: " + a.title, a.amount);
    recompute(); renderHero(); renderBreakdown(); renderAudit();
    const c = $("#card-" + id); if (c) { c.outerHTML = card(a).outerHTML; const nc = $("#card-" + id); if (nc) nc.style.animation = "none"; }
    toast(`Marked sent — ${a.title}`);
  }

  async function markPaid(id, fromDemo) {
    if (!fromDemo && demoBlocked()) return;
    const a = S.actions.find((x) => x.id === id); if (!a || a.approvalState !== "approved") return;
    a.status = "paid";
    await appendAudit("human", "You", "CLAIM_PAID", "Recovered — you confirmed: " + a.title + " (" + a.amount_label + ")", a.amount);
    recompute(); renderHero(); renderBreakdown(); updateReadyUI(); renderAudit();
    const c = $("#card-" + id); if (c) { c.outerHTML = card(a).outerHTML; const nc = $("#card-" + id); if (nc) nc.style.animation = "none"; }
    toast(`💰 Recovered ${a.amount_label} — ${a.title}`);
  }

  function approveAllSafe() {
    if (demoBlocked()) return;
    const safe = S.actions.filter((a) => a.approvalState === "pending" && isLeak(a.kind));
    safe.forEach((a, i) => setTimeout(() => approve(a.id), i * 180));
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let demoRunning = false;
  let demoInternal = false;
  async function demoRecovery() {
    if (demoRunning) return; demoRunning = true;
    try {
      showResults();
      const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const W = (ms) => wait(reduce ? 0 : ms);
      const pick = S.actions.find((a) => a.kind === "flight_comp" && a.approvalState === "pending")
        || S.actions.find((a) => a.cadence === "once" && a.approvalState === "pending")
        || S.actions.find((a) => a.approvalState === "pending");
      if (!pick) { toast("Nothing pending to walk through — hit 'Run recovery scan' to reset"); return; }
      const df = $("#demo-flag"); if (df) df.classList.remove("hidden");
      const card = $("#card-" + pick.id); if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
      toast(`▶ Illustrative walkthrough (demo) — approving ${pick.amount_label}…`); await W(1100);
      demoInternal = true; await approve(pick.id, true); demoInternal = false; await W(1200);
      toast("✉ Claim filed — nothing sent until you approved it"); demoInternal = true; await markSent(pick.id, true); demoInternal = false; await W(1500);
      const ref = "RC-" + Math.floor(100000 + Math.random() * 900000);
      toast(`📨 Acknowledged · reference #${ref} (demo)`); await W(1700);
      demoInternal = true; await markPaid(pick.id, true); demoInternal = false;
      toast(`💰 Demo complete — full loop shown: detect → approve → file → paid. Real payouts land in the timeline each card shows.`);
    } finally {
      demoInternal = false;
      demoRunning = false;
    }
  }

  async function forgetData() {
    try { if (API) await fetch(API + "/api/account/forget", { method: "POST" }); } catch (e) {}
    try { localStorage.removeItem("ro-vrec"); } catch (e) {}
    renderVrec();
    toast("Your stored data was cleared. Revoke Gmail access at myaccount.google.com/permissions.");
  }

  function getVrec() { try { return JSON.parse(localStorage.getItem("ro-vrec") || "[]"); } catch (e) { return []; } }
  function setVrec(v) { try { localStorage.setItem("ro-vrec", JSON.stringify(v)); } catch (e) {} }
  function renderVrec() {
    const list = $("#vrec-list"); if (!list) return;
    const v = getVrec();
    if (!v.length) { list.innerHTML = `<div class="vrec-empty">Nothing logged yet. When you actually get money back — cancel a real subscription, claim real unclaimed cash — log it here with its confirmation reference, so it's <b>checkable</b>, not a vague estimate. (You-logged, not independently audited.)</div>`; return; }
    const totals = v.reduce((acc, r) => { const c = r.currency || "$"; acc[c] = r2((acc[c] || 0) + (r.amount || 0)); return acc; }, {});
    const totalText = Object.entries(totals).map(([c, n]) => `${c}${Number(n).toFixed(2)}`).join(" · ");
    list.innerHTML = `<div class="vrec-empty">Total you've logged: <b style="color:#37d67a">${esc(totalText)}</b> <span class="muted">(you-confirmed)</span></div>` +
      v.map((r) => `<div class="vrec-item"><span>✓ <b>${esc(r.what)}</b>${r.ref ? ` · ref ${esc(r.ref)}` : ""} <span class="muted">· ${esc(r.date)}</span></span><span class="amt">${esc(r.currency || "$")}${Number(r.amount).toFixed(2)}</span></div>`).join("");
  }
  function addVrec() {
    const amt = r2(parseFloat(($("#vrec-amt") || {}).value));
    const currencyRaw = (($("#vrec-currency") || {}).value || "$").trim();
    const currency = ["$", "£", "€"].includes(currencyRaw) ? currencyRaw : "$";
    const what = (($("#vrec-what") || {}).value || "").trim();
    if (!(amt > 0) || !what) { toast("Add a valid amount (at least 0.01) and what you recovered"); return; }
    const v = getVrec();
    v.unshift({ amount: amt, currency, what: what.slice(0, 60), ref: (($("#vrec-ref") || {}).value || "").trim().slice(0, 40), date: new Date().toISOString().slice(0, 10) });
    setVrec(v);
    const f = $("#vrec-form"); if (f) { f.reset(); f.classList.add("hidden"); }
    renderVrec();
    toast(`✓ Logged ${currency}${amt.toFixed(2)} recovery`);
  }

  function mailtoFor(a) {
    const m = a.draft.match(/^Subject:\s*(.*)$/m);
    const subj = encodeURIComponent(m ? m[1] : "Recoup claim");
    const body = encodeURIComponent(a.draft.replace(/^Subject:\s*.*\n\n?/, ""));
    return `mailto:?subject=${subj}&body=${body}`;
  }
  function copyDraft(id) {
    const a = S.actions.find((x) => x.id === id); if (!a) return;
    (navigator.clipboard ? navigator.clipboard.writeText(a.draft) : Promise.reject())
      .then(() => toast("Draft copied — paste into your email or the company's form"))
      .catch(() => toast("Select-and-copy from the draft view"));
  }
  function openMail(id) { const a = S.actions.find((x) => x.id === id); if (a) window.open(mailtoFor(a), "_blank"); }

  async function rescan() {
    await appendAudit("system", "Recoup scanner", "SCAN_RUN", `Re-scanned — $${money(S.recurring_year)}/yr recurring + $${money(S.one_time)} one-time`, S.recoverable);
    renderTrace(true); renderAudit();
    toast("Scan complete — your money surface is up to date");
  }

  // ---- drawer ----
  let _invoker = null;
  // a11y: while a dialog is open, take the rest of the page out of the AT tree + tab order
  // (inert blocks the screen-reader virtual cursor too, not just Tab — complements the focus trap)
  function syncDialogBackground() {
    const open = ($("#scan-modal") && $("#scan-modal").classList.contains("open")) || ($("#drawer") && $("#drawer").classList.contains("open"));
    document.querySelectorAll("#bg-field, .topbar, #main").forEach((e) => {
      if (open) { e.setAttribute("inert", ""); e.setAttribute("aria-hidden", "true"); }
      else { e.removeAttribute("inert"); e.removeAttribute("aria-hidden"); }
    });
  }
  function restoreFocus() { if (_invoker && _invoker.focus && document.contains(_invoker)) { try { _invoker.focus(); } catch (e) {} } _invoker = null; }
  function openDrawer(id) {
    const a = S.actions.find((x) => x.id === id); if (!a) return;
    _invoker = document.activeElement;
    $("#drawer-title").textContent = a.title;
    const conf = a.confidence ? Math.round(a.confidence * 100) : null;
    $("#drawer-meta").innerHTML =
      `<span class="lg ${isLeak(a.kind) ? "leak" : "owed"}">${a.cadence === "once" ? "owed · one-time" : "leak · yearly"}</span>` +
      `<span class="chip">${esc(a.amount_label)} · ${esc(a.unit_note)}</span>` +
      (conf ? `<span class="fc-conf ${esc(a.confidence_band || "")}">${conf}% confidence</span>` : "");
    const checks = (a.verify && a.verify.checks) || [];
    const prov = $("#drawer-prov");
    if (prov) prov.innerHTML =
      (PLAIN[a.kind] ? `<div class="prov-sec"><div class="prov-h">In plain English</div><div class="prov-rule">${esc(PLAIN[a.kind])}</div></div>` : "") +
      `<div class="prov-sec"><div class="prov-h">Why this is recoverable</div>` +
      `<div class="prov-rule">${esc(RULES[a.rule] || a.rule)}</div>` +
      `<div class="prov-ev">Source — ${esc(a.evidence)}</div></div>` +
      `<div class="prov-sec"><div class="prov-h">Verifier checks <span class="prov-by">· independent agent</span></div>` +
      (checks.length ? checks.map((c) => `<div class="prov-check ${c.ok ? "ok" : "bad"}"><span aria-hidden="true">${c.ok ? "✓" : "✗"}</span><span class="sr-only">${c.ok ? "Passed" : "Failed"}: </span>${esc(c.label)}</div>`).join("") : `<div class="prov-check ok"><span aria-hidden="true">✓</span> verified</div>`) +
      `</div>` +
      (a.caveat ? `<div class="prov-sec caveat"><div class="prov-h">⚠ You might NOT qualify if</div><div>${esc(a.caveat)}</div></div>` : "") +
      (a.timeline ? `<div class="prov-sec"><div class="prov-h">What to expect</div><div class="prov-rule">⏱ Typically <b>${esc(a.timeline)}</b> · ${esc(a.odds || "")} to actually land — you file on the form, nothing is automatic.</div></div>` : "") +
      (a.claim_url ? `<a class="btn btn-mail full" href="${safeUrl(a.claim_url)}" target="_blank" rel="noopener">Open the official claim form ↗</a>` : "") +
      `<div class="prov-h" style="margin-top:14px">The drafted claim</div>`;
    $("#drawer-body").textContent = a.draft || "(no draft)";
    const ab = $("#drawer-approve"), sb = $("#drawer-skip");
    ab.style.display = a.approvalState === "approved" ? "none" : "";
    ab.onclick = () => { approve(id); closeDrawer(); };
    sb.onclick = () => skip(id);
    $("#drawer").classList.add("open"); $("#drawer").setAttribute("aria-hidden", "false"); $("#drawer-scrim").classList.add("open"); syncDialogBackground();
    setTimeout(() => { const x = $("#drawer-x"); if (x) x.focus(); }, 60);
  }
  function closeDrawer() { $("#drawer").classList.remove("open"); $("#drawer").setAttribute("aria-hidden", "true"); $("#drawer-scrim").classList.remove("open"); syncDialogBackground(); restoreFocus(); }

  // ---- scan your own data (100% client-side) ----
  function openScan() { _invoker = document.activeElement; $("#scan-scrim").classList.add("open"); $("#scan-modal").classList.add("open"); $("#scan-modal").setAttribute("aria-hidden", "false"); syncDialogBackground(); const i = $("#scan-input"); if (i) setTimeout(() => i.focus(), 50); }
  function closeScan() { $("#scan-scrim").classList.remove("open"); $("#scan-modal").classList.remove("open"); $("#scan-modal").setAttribute("aria-hidden", "true"); syncDialogBackground(); restoreFocus(); }
  function showResults() {
    const r = $("#results"), l = $("#landing");
    if (r) r.classList.remove("hidden");
    if (l) l.classList.add("hidden");
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) {}
    const h = $("#results-heading"); if (h) setTimeout(() => { try { h.focus(); } catch (e) {} }, 40); // move SR focus onto the results so the reveal is announced
  }

  function rosterFrom(findings) {
    const defs = [
      { id: "sub_hunter", name: "Subscription Hunter", mandate: "recurring subscription leaks", kinds: ["dead_subscription", "price_creep"] },
      { id: "billing_auditor", name: "Billing Auditor", mandate: "duplicate fees & billing errors", kinds: ["billing_error"] },
    ];
    return defs.map((d) => {
      const items = findings.filter((f) => d.kinds.includes(f.kind));
      return { id: d.id, name: d.name, mandate: d.mandate, count: items.length, amount: r2(items.reduce((s, f) => s + f.amount, 0)), status: items.length ? "active" : "idle" };
    });
  }

  async function applyFindings(findings, opts) {
    opts = opts || {};
    S.actions = findings;
    S._real = true; S._live = false;
    S.recurring_year = r2(findings.filter((a) => a.cadence === "yearly").reduce((s, a) => s + a.amount, 0));
    S.one_time = r2(findings.filter((a) => a.cadence === "once").reduce((s, a) => s + a.amount, 0));
    S.recoverable = r2(S.recurring_year + S.one_time);
    S.needs_confirm = findings.filter((a) => a.verify && a.verify.needs_confirm).length;
    S.verified = findings.filter((a) => a.verify && a.verify.ok && !(a.verify && a.verify.needs_confirm)).length;
    S.flagged = 0;
    S.swarm = rosterFrom(findings);
    S.run = { model: opts.model || "in-browser rules", live: false, latency_ms: 0 };
    S.reasoning = opts.reasoning || [
      { t: `Found ${findings.length} recoverable items`, tone: "cyan" },
      { t: `$${money(S.recurring_year)}/yr recurring + $${money(S.one_time)} one-time`, tone: "ok" },
      { t: "Review each; nothing sends without your approval", tone: "dim" },
    ];
    S.audit = [];
    await appendAudit("system", opts.scanner || "Recoup", "SCAN_RUN", opts.auditLabel || `Found ${findings.length} recoverable items, $${money(S.recoverable)} recoverable`, S.recoverable);
    renderAll(true);
    showResults();
  }

  async function runScan() {
    if (demoBlocked()) return;
    const text = ($("#scan-input") && $("#scan-input").value) || "";
    const res = window.RecoupScan ? window.RecoupScan.scan(text) : { findings: [] };
    if (!res.findings || !res.findings.length) { toast("No recurring charges found — add more lines or try the sample"); return; }
    await applyFindings(res.findings, {
      scanner: "Recoup (in-browser)",
      auditLabel: `Scanned ${res.txns} of your transactions — ${res.findings.length} items, $${money(res.total)} recoverable`,
      reasoning: [
        { t: `Scanned ${res.txns} transactions in your browser — nothing left this device`, tone: "cyan" },
        { t: `Subscription Hunter + Billing Auditor found ${res.findings.length} recoverable items`, tone: "warn" },
        { t: `$${money(res.recurring_year)}/yr recurring + $${money(res.one_time)} one-time`, tone: "ok" },
        { t: "Review each; nothing sends without your approval", tone: "dim" },
      ],
    });
    closeScan();
    toast(`Found ${res.findings.length} recoverable items in YOUR data`);
  }

  async function loadGmail(token) {
    try {
      const d = await gmailFindings(token);
      if (d.findings && d.findings.length) {
        const recur = r2(d.findings.filter((a) => a.cadence === "yearly").reduce((s, a) => s + (a.amount || 0), 0));
        await applyFindings(d.findings, {
          model: "Gmail read-only", scanner: "Recoup (Gmail)",
          auditLabel: `Read your subscription emails — ${d.findings.length} subscriptions found`,
          reasoning: [
            { t: "Connected your Gmail (read-only) — scanned subscription & receipt emails", tone: "cyan" },
            { t: `Subscription Hunter found ${d.findings.length} subscriptions you're paying for`, tone: "warn" },
            { t: `$${money(recur)}/yr across your subscriptions`, tone: "ok" },
            { t: "Review each; nothing sends without your approval", tone: "dim" },
          ],
        });
        toast(`Found ${d.findings.length} subscriptions in your Gmail`);
      } else { toast("No subscriptions detected in your Gmail — try the paste scan"); }
    } catch (e) { toast("Couldn't load Gmail results — try again"); }
  }

  async function gmailFindings(token) {
    const r = await fetch(API + "/api/gmail/findings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (r.ok) return r.json();
    // Backward compatibility while the Space rebuilds or if only the frontend is deployed.
    if (r.status === 404 || r.status === 405) {
      return fetch(API + "/api/gmail/findings?token=" + encodeURIComponent(token)).then((res) => res.json());
    }
    throw new Error("gmail findings failed");
  }

  // ---- misc ----
  function gmailHandoff() {
    const fromQuery = new URLSearchParams(location.search).get("gmail");
    if (fromQuery) return fromQuery;
    const raw = (location.hash || "").replace(/^#/, "");
    return new URLSearchParams(raw).get("gmail");
  }

  function wire() {
    document.body.addEventListener("click", (ev) => {
      const openScanBtn = ev.target.closest("[data-open-scan]");
      if (openScanBtn) { openScan(); return; }
      const showResultsBtn = ev.target.closest("[data-show-results]");
      if (showResultsBtn) { showResults(); return; }
      const t = ev.target.closest("[data-approve],[data-skip],[data-view],[data-copy],[data-mail],[data-sent],[data-paid]"); if (!t) return;
      if (t.dataset.approve) approve(t.dataset.approve);
      else if (t.dataset.skip) skip(t.dataset.skip);
      else if (t.dataset.view) openDrawer(t.dataset.view);
      else if (t.dataset.copy) copyDraft(t.dataset.copy);
      else if (t.dataset.mail) openMail(t.dataset.mail);
      else if (t.dataset.sent) markSent(t.dataset.sent);
      else if (t.dataset.paid) markPaid(t.dataset.paid);
    });
    $("#btn-scan").onclick = rescan;
    $("#btn-approve-all").onclick = approveAllSafe;
    const dr = $("#demo-recovery"); if (dr) dr.onclick = demoRecovery;
    const fd = $("#forget-data"); if (fd) fd.onclick = (e) => { e.preventDefault(); forgetData(); };
    const va = $("#vrec-add"); if (va) va.onclick = () => { const f = $("#vrec-form"); if (f) { f.classList.toggle("hidden"); const open = !f.classList.contains("hidden"); va.setAttribute("aria-expanded", String(open)); if (open) { const amt = $("#vrec-amt"); if (amt) amt.focus(); } } };
    const vf = $("#vrec-form"); if (vf) vf.onsubmit = (e) => { e.preventDefault(); addVrec(); };
    document.addEventListener("keydown", (e) => {
      const dlg = $("#drawer").classList.contains("open") ? $("#drawer") : ($("#scan-modal").classList.contains("open") ? $("#scan-modal") : null);
      if (!dlg) return;
      if (e.key === "Escape") { dlg.id === "drawer" ? closeDrawer() : closeScan(); return; }
      if (e.key === "Tab") {
        const vis = [...dlg.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null && !el.disabled);
        if (!vis.length) return;
        const first = vis[0], last = vis[vis.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    $("#drawer-x").onclick = closeDrawer;
    $("#drawer-scrim").onclick = closeDrawer;
    const tt = $("#theme-toggle");
    if (tt) tt.onclick = () => { const t = document.body.classList.contains("light") ? "dark" : "light"; try { localStorage.setItem("ro-theme", t); } catch (e) {} applyTheme(t); };
    const sx = $("#scan-x"); if (sx) sx.onclick = closeScan;
    const ssc = $("#scan-scrim"); if (ssc) ssc.onclick = closeScan;
    const sr = $("#scan-run"); if (sr) sr.onclick = runScan;
    const sm = $("#scan-sample"); if (sm) sm.onclick = () => { const i = $("#scan-input"); if (i && window.RecoupScan) i.value = window.RecoupScan.SAMPLE; };
    const gc = $("#gmail-connect"); if (gc) gc.onclick = async () => {
      if (!API) { toast("Connect Gmail goes live with the backend — paste a statement below (works now)."); return; }
      try {
        const st = await fetch(API + "/api/auth/status").then((r) => r.json());
        if (st.providers && st.providers.google) location.href = API + "/api/gmail/start";
        else toast("Gmail connect needs the Google OAuth client (your ~4 clicks) — paste a statement below for now.");
      } catch (e) { toast("Backend waking up — paste a statement below (works offline), or retry in a moment."); }
    };
    const ob = $("#open-scan"); if (ob) ob.onclick = openScan;
    const fm = $("#find-money"); if (fm) fm.onclick = openScan;
    const se = $("#see-example"); if (se) se.onclick = showResults;
  }

  function applyTheme(t) {
    document.body.classList.toggle("light", t === "light");
    const b = document.querySelector("#theme-toggle"); if (b) { b.textContent = t === "light" ? "☀" : "◐"; b.setAttribute("aria-pressed", String(t === "light")); }
  }

  let toastT;
  function toast(msg) {
    let t = $(".toast"); if (!t) { t = el("div", "toast"); t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); document.body.appendChild(t); }
    t.textContent = "✓ " + msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2800);
  }

  function animateCount(node, target) {
    if (!node) return;
    // guarantee the final value even when rAF is paused (hidden/background tab) or motion is reduced
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if ((typeof document !== "undefined" && document.hidden) || reduce) { node.textContent = money(target); return; }
    const start = parseFloat((node.textContent || "0").replace(/[^0-9.]/g, "")) || 0;
    const t0 = performance.now(), dur = 700;
    function step(now) {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      node.textContent = money(start + (target - start) * e);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function catLabel(k) {
    return { dead_subscription: "Dead subscriptions", price_creep: "Price hikes", billing_error: "Billing errors", price_drop: "Price-drop refunds", flight_comp: "Flight compensation", settlement: "Settlements", unclaimed: "Unclaimed property", warranty: "Warranty claims", deposit: "Deposit returns" }[k] || k;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function safeUrl(u) { const s = String(u || "").trim(); return /^https?:\/\//i.test(s) ? esc(s) : "#"; }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
