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
  let S = null;

  const $ = (s) => document.querySelector(s);
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const money = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const isLeak = (k) => LEAK.has(k);

  /* real SHA-256 (Web Crypto) — 64-char hex, chained like the backend's audit.py */
  async function sha256(str) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function boot() {
    try { applyTheme(localStorage.getItem("ro-theme") || "dark"); } catch (e) {}
    if (API) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000); // cold-start safety: fall back to embedded data fast
        const res = await fetch(API + "/api/state", { signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok) { S = await res.json(); S._live = true; }
      } catch (e) { /* fall back to embedded data instantly */ }
    }
    if (!S) { S = JSON.parse(JSON.stringify(window.RO_FALLBACK || { actions: [], audit: [], reasoning: [] })); S._live = false; }
    S.actions = S.actions || []; S.audit = S.audit || []; S.reasoning = S.reasoning || [];
    recompute();
    renderAll(true);
    wire();
    // Gmail OAuth handoff: ?gmail=<one-time-token> | ok | err
    try {
      const gp = new URLSearchParams(location.search).get("gmail");
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
    renderTrace(animateTrace);
  }

  function renderSwarm() {
    const box = $("#swarm"); if (!box) return; box.innerHTML = "";
    const roster = S.swarm || [];
    const meta = $("#swarm-meta");
    if (meta) meta.textContent = roster.length ? `${roster.length} agents · ${S.verified || 0} auto-verified${S.needs_confirm ? " · " + S.needs_confirm + " need sign-off" : ""}` : "—";
    roster.forEach((a) => {
      const c = el("div", "agent-card" + (a.count ? " active" : ""));
      c.setAttribute("role", "listitem");
      c.setAttribute("aria-label", `${a.name}: ${a.count} found, $${money(a.amount)} recoverable`);
      c.innerHTML = `<div class="ag-top"><span class="ag-dot"></span><span class="ag-name">${esc(a.name)}</span><span class="ag-count">${a.count}</span></div>
        <div class="ag-mandate">${esc(a.mandate)}</div>
        <div class="ag-stat">$${money(a.amount)} recoverable</div>`;
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
    const gem = (live.gemini || "fallback") === "live";
    const mon = (live.mongodb || "fallback") === "live";
    box.appendChild(chip(gem ? "Gemini · live" : "AI reasoning · on", gem ? "live" : ""));
    box.appendChild(chip(mon ? "MongoDB · live" : "Storage · local", mon ? "live" : ""));
    box.appendChild(chip("Audit · SHA-256", "live"));
    box.appendChild(chip(S._live ? "Backend · live" : "Sample data", S._live ? "live" : ""));
  }

  function renderHero() {
    animateCount($("#one-time"), S.one_time);
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
    setText("#pending-count", S.actions.filter((a) => a.approvalState === "pending").length);
    const paid = r2(S.actions.filter((a) => a.status === "paid").reduce((s, a) => s + a.amount, 0));
    setText("#recovered-amt", "$" + money(paid));
    const frac = n ? appr.length / n : 0;
    const C = 2 * Math.PI * 52;
    const ring = $("#ring-fg"); if (ring) ring.style.strokeDashoffset = String(C * (1 - frac));
    setText("#ring-pct", Math.round(frac * 100) + "%");
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
    S.actions.forEach((a) => { const k = catLabel(a.kind); cats[k] = cats[k] || { amt: 0, leak: isLeak(a.kind) }; cats[k].amt += a.amount || 0; });
    const max = Math.max(1, ...Object.values(cats).map((c) => c.amt));
    const box = $("#breakdown"); box.innerHTML = "";
    Object.entries(cats).sort((a, b) => b[1].amt - a[1].amt).forEach(([k, c]) => {
      const row = el("div", "bd-row");
      row.innerHTML = `<div class="bd-top"><span class="nm">${k}</span><span class="vl">$${money(c.amt)}${c.leak ? "/yr" : ""}</span></div><div class="bd-bar"><div class="bd-fill ${c.leak ? "leak" : ""}"></div></div>`;
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
    c.id = "card-" + a.id;
    c.setAttribute("role", "listitem");
    c.setAttribute("aria-label", `${a.title}, ${a.amount_label}, ${a.confidence ? Math.round(a.confidence * 100) + "% confidence" : ""}`);
    const conf = a.confidence ? Math.round(a.confidence * 100) : null;
    const sendRow = `<div class="fc-send">
        <button class="btn btn-copy" data-copy="${a.id}" aria-label="Copy claim text">⧉ Copy</button>
        ${a.claim_url ? `<a class="btn btn-mail" href="${esc(a.claim_url)}" target="_blank" rel="noopener">Claim form ↗</a>` : `<button class="btn btn-mail" data-mail="${a.id}">✉ Email</button>`}
      </div>`;
    let actions;
    if (a.approvalState === "rejected") {
      actions = `<div class="fc-actions"><button class="btn btn-approve" data-approve="${a.id}">✓ Approve instead</button><button class="btn btn-view" data-view="${a.id}">Show work</button></div>`;
    } else if (!approved) {
      actions = `<div class="fc-actions">
           <button class="btn btn-approve" data-approve="${a.id}">✓ Approve</button>
           <button class="btn btn-view" data-view="${a.id}">Show work</button>
           <button class="btn btn-skip" data-skip="${a.id}">Skip</button>
         </div>`;
    } else if (st === "paid") {
      actions = `<div class="fc-paid">✓ Recovered ${esc(a.amount_label)}</div>`;
    } else if (st === "sent") {
      actions = `${sendRow}<button class="btn btn-life paid full" data-paid="${a.id}">💰 Mark recovered</button>`;
    } else {
      actions = `${sendRow}<button class="btn btn-life full" data-sent="${a.id}">Mark sent →</button>`;
    }
    const tag = approved
      ? `<span class="fc-kind ready">${st === "paid" ? "✓ paid" : st === "sent" ? "sent" : "✓ ready"}</span>`
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
      ${a.agent_name ? `<div class="fc-agent">◆ ${esc(a.agent_name)}${a.verify ? (a.verify.needs_confirm ? ` · <span class="needs-confirm">⚠ confirm eligibility</span>` : (a.verify.ok ? " · verified" : "")) : ""} · <button class="linklike" data-view="${a.id}">show work</button></div>` : ""}
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
  async function appendAudit(actor_type, actor_name, event_type, label, amount) {
    const prev = S.audit.length ? S.audit[S.audit.length - 1].hash : "0".repeat(64);
    const e = { event_id: "au_" + String(S.audit.length + 1).padStart(4, "0"), actor_type, actor_name, event_type, label, amount: amount || 0, prev_hash: prev };
    e.hash = await sha256(prev + JSON.stringify(e));
    S.audit.push(e);
  }

  async function approve(id) {
    const a = S.actions.find((x) => x.id === id); if (!a || a.approvalState === "approved") return;
    a.approvalState = "approved"; a.status = "claim_ready"; a.claimedAt = new Date().toISOString?.() || "now";
    await appendAudit("human", "You", "ACTION_APPROVED", "Approved (claim ready): " + a.title, a.amount);
    recompute(); renderHero(); renderBreakdown(); renderAudit();
    const c = $("#card-" + id); if (c) c.outerHTML = card(a).outerHTML;
    toast(`Claim drafted — ready to send: ${a.title}`);
    if (API) { try { await fetch(`${API}/api/actions/${id}/approve`, { method: "POST" }); } catch (e) {} }
  }

  async function skip(id) {
    const a = S.actions.find((x) => x.id === id); if (!a) return;
    a.approvalState = "rejected"; a.status = "drafted";
    await appendAudit("human", "You", "ACTION_REJECTED", "Skipped: " + a.title);
    recompute(); renderHero(); renderBreakdown(); renderAudit();
    const c = $("#card-" + id); if (c) c.outerHTML = card(a).outerHTML;
    closeDrawer();
    if (API) { try { await fetch(`${API}/api/actions/${id}/reject`, { method: "POST" }); } catch (e) {} }
  }

  async function markSent(id) {
    const a = S.actions.find((x) => x.id === id); if (!a || a.approvalState !== "approved") return;
    a.status = "sent";
    await appendAudit("human", "You", "CLAIM_SENT", "Claim sent: " + a.title, a.amount);
    renderAudit();
    const c = $("#card-" + id); if (c) c.outerHTML = card(a).outerHTML;
    toast(`Marked sent — ${a.title}`);
    if (API) { try { await fetch(`${API}/api/actions/${id}/sent`, { method: "POST" }); } catch (e) {} }
  }

  async function markPaid(id) {
    const a = S.actions.find((x) => x.id === id); if (!a || a.approvalState !== "approved") return;
    a.status = "paid";
    await appendAudit("human", "You", "CLAIM_PAID", "Recovered — you confirmed: " + a.title + " (" + a.amount_label + ")", a.amount);
    updateReadyUI(); renderAudit();
    const c = $("#card-" + id); if (c) c.outerHTML = card(a).outerHTML;
    toast(`💰 Recovered ${a.amount_label} — ${a.title}`);
    if (API) { try { await fetch(`${API}/api/actions/${id}/paid`, { method: "POST" }); } catch (e) {} }
  }

  function approveAllSafe() {
    const safe = S.actions.filter((a) => a.approvalState === "pending" && isLeak(a.kind));
    safe.forEach((a, i) => setTimeout(() => approve(a.id), i * 180));
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
  function openDrawer(id) {
    const a = S.actions.find((x) => x.id === id); if (!a) return;
    $("#drawer-title").textContent = a.title;
    const conf = a.confidence ? Math.round(a.confidence * 100) : null;
    $("#drawer-meta").innerHTML =
      `<span class="lg ${isLeak(a.kind) ? "leak" : "owed"}">${a.cadence === "once" ? "owed · one-time" : "leak · yearly"}</span>` +
      `<span class="chip">${esc(a.amount_label)} · ${esc(a.unit_note)}</span>` +
      (conf ? `<span class="fc-conf ${esc(a.confidence_band || "")}">${conf}% confidence</span>` : "");
    const checks = (a.verify && a.verify.checks) || [];
    const prov = $("#drawer-prov");
    if (prov) prov.innerHTML =
      `<div class="prov-sec"><div class="prov-h">Why this is recoverable</div>` +
      `<div class="prov-rule">${esc(RULES[a.rule] || a.rule)}</div>` +
      `<div class="prov-ev">Source — ${esc(a.evidence)}</div></div>` +
      `<div class="prov-sec"><div class="prov-h">Verifier checks <span class="prov-by">· independent agent</span></div>` +
      (checks.length ? checks.map((c) => `<div class="prov-check ${c.ok ? "ok" : "bad"}">${c.ok ? "✓" : "✗"} ${esc(c.label)}</div>`).join("") : `<div class="prov-check ok">✓ verified</div>`) +
      `</div>` +
      (a.caveat ? `<div class="prov-sec caveat"><div class="prov-h">⚠ You might NOT qualify if</div><div>${esc(a.caveat)}</div></div>` : "") +
      (a.claim_url ? `<a class="btn btn-mail full" href="${esc(a.claim_url)}" target="_blank" rel="noopener">Open the official claim form ↗</a>` : "") +
      `<div class="prov-h" style="margin-top:14px">The drafted claim</div>`;
    $("#drawer-body").textContent = a.draft || "(no draft)";
    const ab = $("#drawer-approve"), sb = $("#drawer-skip");
    ab.style.display = a.approvalState === "approved" ? "none" : "";
    ab.onclick = () => { approve(id); closeDrawer(); };
    sb.onclick = () => skip(id);
    $("#drawer").classList.add("open"); $("#drawer-scrim").classList.add("open");
  }
  function closeDrawer() { $("#drawer").classList.remove("open"); $("#drawer-scrim").classList.remove("open"); }

  // ---- scan your own data (100% client-side) ----
  function openScan() { $("#scan-scrim").classList.add("open"); $("#scan-modal").classList.add("open"); const i = $("#scan-input"); if (i) setTimeout(() => i.focus(), 50); }
  function closeScan() { $("#scan-scrim").classList.remove("open"); $("#scan-modal").classList.remove("open"); }
  function showResults() {
    const r = $("#results"), l = $("#landing");
    if (r) r.classList.remove("hidden");
    if (l) l.classList.add("hidden");
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) {}
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
      const d = await fetch(API + "/api/gmail/findings?token=" + encodeURIComponent(token)).then((r) => r.json());
      if (d.findings && d.findings.length) {
        await applyFindings(d.findings, {
          model: "Gmail read-only", scanner: "Recoup (Gmail)",
          auditLabel: `Read your subscription emails — ${d.findings.length} subscriptions found`,
          reasoning: [
            { t: "Connected your Gmail (read-only) — scanned subscription & receipt emails", tone: "cyan" },
            { t: `Subscription Hunter found ${d.findings.length} subscriptions you're paying for`, tone: "warn" },
            { t: `$${money(S.recurring_year)}/yr across your subscriptions`, tone: "ok" },
            { t: "Review each; nothing sends without your approval", tone: "dim" },
          ],
        });
        toast(`Found ${d.findings.length} subscriptions in your Gmail`);
      } else { toast("No subscriptions detected in your Gmail — try the paste scan"); }
    } catch (e) { toast("Couldn't load Gmail results — try again"); }
  }

  // ---- misc ----
  function wire() {
    document.body.addEventListener("click", (ev) => {
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
    const b = document.querySelector("#theme-toggle"); if (b) b.textContent = t === "light" ? "☀" : "◐";
  }

  let toastT;
  function toast(msg) {
    let t = $(".toast"); if (!t) { t = el("div", "toast"); document.body.appendChild(t); }
    t.textContent = "✓ " + msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2800);
  }

  function animateCount(node, target) {
    if (!node) return;
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

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
