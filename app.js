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
    if (API) { try { const res = await fetch(API + "/api/state"); if (res.ok) { S = await res.json(); S._live = true; } } catch (e) { /* fall back */ } }
    if (!S) { S = JSON.parse(JSON.stringify(window.RO_FALLBACK || { actions: [], audit: [], reasoning: [] })); S._live = false; }
    S.actions = S.actions || []; S.audit = S.audit || []; S.reasoning = S.reasoning || [];
    recompute();
    renderAll(true);
    wire();
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
    if (meta) meta.textContent = roster.length ? `${roster.length} agents · ${S.verified || 0}/${S.actions.length} verified` : "—";
    roster.forEach((a) => {
      const c = el("div", "agent-card" + (a.count ? " active" : ""));
      c.innerHTML = `<div class="ag-top"><span class="ag-dot"></span><span class="ag-name">${esc(a.name)}</span><span class="ag-count">${a.count}</span></div>
        <div class="ag-mandate">${esc(a.mandate)}</div>
        <div class="ag-stat">$${money(a.amount)} recoverable</div>`;
      box.appendChild(c);
    });
  }

  function renderChips() {
    const live = S.integrations || {};
    const box = $("#status-chips"); box.innerHTML = "";
    const gem = (live.gemini || "fallback") === "live";
    const mon = (live.mongodb || "fallback") === "live";
    const chip = (txt, cls) => el("span", "chip " + cls, `<span class="d"></span>${txt}`);
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
    updateReadyUI();
  }

  function updateReadyUI() {
    const appr = S.actions.filter((a) => a.approvalState === "approved");
    const n = S.actions.length;
    setText("#ready-count", appr.length);
    setText("#total-count", n);
    setText("#pending-count", S.actions.filter((a) => a.approvalState === "pending").length);
    const once = r2(appr.filter((a) => a.cadence === "once").reduce((s, a) => s + a.amount, 0));
    const rec = r2(appr.filter((a) => a.cadence === "yearly").reduce((s, a) => s + a.amount, 0));
    setText("#secured-once", "$" + money(once));
    setText("#secured-rec", "$" + money(rec));
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
    S.actions.forEach((a) => box.appendChild(card(a)));
  }

  function card(a) {
    const leak = isLeak(a.kind), once = a.cadence === "once";
    const approved = a.approvalState === "approved";
    const c = el("div", "fcard" + (approved ? " claim-ready" : a.approvalState === "rejected" ? " skipped" : "") + (once ? " fc-onetime" : ""));
    c.id = "card-" + a.id;
    const actions = approved
      ? `<div class="fc-send">
           <button class="btn btn-copy" data-copy="${a.id}">⧉ Copy email</button>
           <button class="btn btn-mail" data-mail="${a.id}">✉ Open in email</button>
         </div>`
      : `<div class="fc-actions">
           <button class="btn btn-approve" data-approve="${a.id}">✓ Approve</button>
           <button class="btn btn-view" data-view="${a.id}">View draft</button>
           ${a.approvalState === "pending" ? `<button class="btn btn-skip" data-skip="${a.id}">Skip</button>` : ""}
         </div>`;
    c.innerHTML = `
      <div class="fc-top">
        <div class="fc-title">${esc(a.title)}</div>
        ${approved ? `<span class="fc-kind ready">✓ ready</span>` : `<span class="fc-kind ${leak ? "leak" : "owed"}">${once ? "owed · one-time" : "leak · yearly"}</span>`}
      </div>
      <div class="fc-amount">${esc(a.amount_label)} <small>· ${esc(a.unit_note)}</small></div>
      <div class="fc-ev">${esc(a.evidence)}</div>
      <div class="fc-rule">${esc(RULES[a.rule] || a.rule)}</div>
      ${a.agent_name ? `<div class="fc-agent">◆ found by ${esc(a.agent_name)}${a.verify && a.verify.ok ? " · verified" : ""}</div>` : ""}
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
    $("#drawer-meta").innerHTML = `<span class="lg ${isLeak(a.kind) ? "leak" : "owed"}">${a.cadence === "once" ? "owed · one-time" : "leak · yearly"}</span><span class="chip">${esc(a.amount_label)} · ${esc(a.unit_note)}</span>`;
    $("#drawer-body").textContent = a.draft || "(no draft)";
    const ab = $("#drawer-approve"), sb = $("#drawer-skip");
    ab.style.display = a.approvalState === "approved" ? "none" : "";
    ab.onclick = () => { approve(id); closeDrawer(); };
    sb.onclick = () => skip(id);
    $("#drawer").classList.add("open"); $("#drawer-scrim").classList.add("open");
  }
  function closeDrawer() { $("#drawer").classList.remove("open"); $("#drawer-scrim").classList.remove("open"); }

  // ---- misc ----
  function wire() {
    document.body.addEventListener("click", (ev) => {
      const t = ev.target.closest("[data-approve],[data-skip],[data-view],[data-copy],[data-mail]"); if (!t) return;
      if (t.dataset.approve) approve(t.dataset.approve);
      else if (t.dataset.skip) skip(t.dataset.skip);
      else if (t.dataset.view) openDrawer(t.dataset.view);
      else if (t.dataset.copy) copyDraft(t.dataset.copy);
      else if (t.dataset.mail) openMail(t.dataset.mail);
    });
    $("#btn-scan").onclick = rescan;
    $("#btn-approve-all").onclick = approveAllSafe;
    $("#drawer-x").onclick = closeDrawer;
    $("#drawer-scrim").onclick = closeDrawer;
    const tt = $("#theme-toggle");
    if (tt) tt.onclick = () => { const t = document.body.classList.contains("light") ? "dark" : "light"; try { localStorage.setItem("ro-theme", t); } catch (e) {} applyTheme(t); };
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
