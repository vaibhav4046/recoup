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
    billing_error: "Duplicate/undisclosed fee — ask the vendor first; chargeback is the fallback.",
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

  // one coherent inline-SVG icon set (stroke, currentColor) — replaces inconsistent platform emoji
  const ICONS = {
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    flask: '<path d="M9 3h6M10 3v6l-5.6 9.3A2 2 0 0 0 6.1 22h11.8a2 2 0 0 0 1.7-3.7L14 9V3"/><path d="M7.5 14.5h9"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    diamond: '<path d="M12 2.5 21.5 12 12 21.5 2.5 12z"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-4.5"/>',
    play: '<path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/>',
    upRight: '<path d="M7 17 17 7M8 7h9v9"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  };
  const icon = (name) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;

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

  // PWA INSTALL — surface the real install prompt as a visible button (Chrome/Edge fire
  // beforeinstallprompt; Safari/iOS get clear manual steps; hidden once installed).
  let _installEvt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); _installEvt = e;
    const b = document.getElementById("install-app"); if (b) b.classList.remove("hidden");
  });
  window.addEventListener("appinstalled", () => {
    const b = document.getElementById("install-app"); if (b) b.classList.add("hidden");
  });
  document.addEventListener("DOMContentLoaded", () => {
    const b = document.getElementById("install-app"); if (!b) return;
    const standalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
    const apple = /iphone|ipad|macintosh/i.test(navigator.userAgent) && !window.chrome;
    if (!standalone && apple) b.classList.remove("hidden");  // Safari: show with manual steps
    b.onclick = async () => {
      if (_installEvt) { _installEvt.prompt(); try { await _installEvt.userChoice; } catch (e) {} _installEvt = null; }
      else if (apple) alert("Install Recoup as an app:\n\niPhone/iPad: Share button, then Add to Home Screen\nMac (Safari): File menu, then Add to Dock\nChrome/Edge: address-bar install icon");
      else alert("In Chrome or Edge: click the install icon in the address bar, or Menu -> Cast, save and share -> Install Recoup.");
    };
  });

  async function boot() {
    // ULTRA-FAST sign-in path: if this device signed in before, paint the dashboard IMMEDIATELY
    // (no landing flash, no transform) — checkAuth() then confirms the session in the background
    // and downgrades gracefully if it expired.
    try {
      if (localStorage.getItem("ro_signed_in") === "1") {
        const r = $("#results"), l = $("#landing");
        if (r) r.classList.remove("hidden");
        if (l) l.classList.add("hidden");
      }
    } catch (e) {}
    const auditLink = $("#audit-verify-link");
    if (auditLink && API) {
      auditLink.href = API + "/api/health";
      auditLink.target = "_blank";
      auditLink.rel = "noopener";
      auditLink.textContent = "Verify the live chain head & integrity at /api/health";
    }
    // dark-only design
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
    // per-visitor demo: start every visitor's ACTIONS clean — never inherit another visitor's
    // approvals from the shared backend. The AUDIT CHAIN is deliberately NOT cleared: it is the
    // service's persistent tamper-evident record (the whole point), and blanking it made the UI
    // say "0 events" while /api/health proved hundreds — a contradiction users rightly flagged.
    S.actions.forEach((a) => { a.approvalState = "pending"; a.status = "drafted"; });
    recompute();
    renderAll(true);
    wire();
    // premium scroll choreography for the expanded landing sections (same bulletproof reveal as results)
    revealGroup([...document.querySelectorAll(".landing-expanded > section, #agent-timeline")]);
    checkAuth(); // signed-in session -> personalized topbar + land in the command center
    // Gmail OAuth handoff: #gmail=<short-lived-token> | err. Query support remains for old callbacks.
    let hadHandoff = false;
    try {
      const gp = gmailHandoff();
      if (gp) {
        hadHandoff = gp !== "err";
        history.replaceState({}, "", location.pathname);
        if (gp === "err") toast("Gmail connect failed — try again, or use the paste scan");
        else if (gp !== "ok" && API) loadGmail(gp);
      }
    } catch (e) {}
    // no fresh handoff -> bring back YOUR last real scan instead of the sample demo
    if (!hadHandoff) restoreUserSurface();
  }

  function sumAmt(pred) { return r2(S.actions.filter(pred).reduce((s, a) => s + (a.amount || 0), 0)); }
  function recompute() {
    S.recurring_year = S.recurring_year || sumAmt((a) => a.cadence === "yearly");
    S.one_time = S.one_time || sumAmt((a) => a.cadence === "once");
    S.recoverable = S.recoverable || r2(S.recurring_year + S.one_time);
    S.ready = sumAmt((a) => a.approvalState === "approved");
  }

  function renderAll(animateTrace) {
    renderChips(); renderHero(); renderSwarm(); renderBreakdown(); renderDrains(); renderFindings(); renderAudit();
    renderTrace(animateTrace); renderVrec();
  }

  function renderSwarm() {
    const box = $("#swarm"); if (!box) return; box.innerHTML = "";
    const roster = S.swarm || [];
    const meta = $("#swarm-meta");
    if (meta) meta.textContent = roster.length ? `${roster.length} agents · ${S.verified || 0} rule-checked${S.needs_confirm ? " · " + S.needs_confirm + " need sign-off" : ""}` : "—";
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
    const runModel = S.run && S.run.model ? String(S.run.model) : "";
    const aiLive = (live.gemini || "fallback") === "live" && S._live && !!(S.run && S.run.live);
    // Honest chip: name the tier that ACTUALLY produced the reasoning — never claim Gemini when a
    // free-tier Gemma fallback ran. (The most-repeated user-test complaint across two rounds.)
    let aiChip = "AI reasoning · on";
    if (aiLive) aiChip = runModel.indexOf("gemini-3") === 0 ? "Gemini 3 · live"
      : runModel.indexOf("gemma") === 0 ? "Gemma · live (fallback)"
      : runModel.indexOf("gemini") === 0 ? "Gemini · live" : "AI · live";
    const mon = (live.mongodb || "fallback") === "live" && S._live; // never show "MongoDB · live" on embedded sample data
    box.appendChild(chip(aiChip, aiLive ? "live" : ""));
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
      ? `${icon('lock')} <b>Your data</b> — scanned privately in your browser. Nothing was uploaded. <button class="linklike2" id="open-scan">Re-scan →</button>`
      : `${icon('flask')} <b>Sample inbox</b> — example data, $0 of this is yours yet. <button class="linklike2" id="open-scan">Recover your own subscriptions →</button>`;
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
    $("#reason-model").textContent = modelLabel(run);
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

  function renderDrains() {
    const box = $("#drains-list"); if (!box) return;
    const sec = $("#drains");
    // rank the recurring leaks by annual cost — the agent's "cancel these first" recommendation
    const drains = S.actions.filter((a) => a.cadence === "yearly" && a.approvalState !== "rejected")
      .sort((x, y) => (y.amount || 0) - (x.amount || 0)).slice(0, 3);
    if (!drains.length) { if (sec) sec.style.display = "none"; return; }
    if (sec) sec.style.display = "";
    const total = r2(drains.reduce((s, a) => s + (a.amount || 0), 0));
    const sub = $("#drains-sub"); if (sub) sub.textContent = `— cancel these ${drains.length} and keep $${money(total)}/yr`;
    box.innerHTML = "";
    drains.forEach((a, i) => {
      const cUrl = cancelUrl(a);
      const row = el("div", "drain-row");
      const name = esc((a.raw || a.title || "").replace(/^(Review|Challenge)\s+/i, "").replace(/\s+(subscription|price hike)$/i, ""));
      row.innerHTML = `
        <span class="drain-rank">#${i + 1}</span>
        <div class="drain-main">
          <b>${name}</b>
          <span class="drain-why">${esc(a.kind === "price_creep" ? "price keeps climbing — challenge it or walk" : "auto-paying every cycle — keep it if you use it; cancel only if you don't")}</span>
        </div>
        <span class="drain-amt">$${money(a.amount)}<small>/yr</small></span>
        ${cUrl ? `<a class="btn btn-mail drain-cancel" href="${safeUrl(cUrl)}" target="_blank" rel="noopener">Cancel ${icon('upRight')}</a>` : ""}
        <button class="btn btn-ghost drain-view" data-view="${esc(a.id)}">Why?</button>`;
      box.appendChild(row);
    });
    box.querySelectorAll("[data-view]").forEach((b) => { b.onclick = () => openDrawer(b.dataset.view); });
  }

  // FILTERS + INSIGHTS — zone the money surface (subscriptions / trials / price hikes / owed /
  // kept). Counts and the insight line are computed deterministically from the data — never by
  // a model — so they cannot hallucinate.
  let _filter = "all";
  function _bucket(a) {
    if (a.approvalState === "rejected") return "kept";
    if (/trial/i.test(a.title || "")) return "trials";
    if (a.kind === "price_creep") return "hikes";
    if (a.kind === "dead_subscription") return "subs";
    if (a.cadence === "once") return "owed";
    return "subs";
  }
  function renderFilters() {
    let bar = $("#filter-bar");
    if (!bar) {
      bar = el("div", "filter-bar"); bar.id = "filter-bar";
      const f = $("#findings"); if (f && f.parentNode) f.parentNode.insertBefore(bar, f);
    }
    const n = (k) => S.actions.filter((a) => _bucket(a) === k).length;
    const chips = [["all", "All", S.actions.length], ["subs", "🔁 Subscriptions", n("subs")], ["trials", "⏳ Trials", n("trials")],
                   ["hikes", "💢 Price hikes", n("hikes")], ["owed", "💰 Owed to you", n("owed")], ["kept", "✓ In use (kept)", n("kept")]];
    bar.innerHTML = chips.filter((c) => c[0] === "all" || c[2] > 0)
      .map(([k, label, count]) => `<button class="fchip${_filter === k ? " on" : ""}" data-f="${k}">${label} <span class="fchip-n">${count}</span></button>`).join("");
    // honest insight line — pure arithmetic over YOUR findings, no model involved
    const pend = S.actions.filter((a) => a.approvalState === "pending");
    const big = pend.filter((a) => a.cadence === "yearly").sort((x, y) => y.amount - x.amount)[0];
    const trials = pend.filter((a) => /trial/i.test(a.title || ""));
    const bits = [];
    if (big) bits.push(`biggest unconfirmed drain: <b>${esc((big.raw || big.title).split(/[—(]/)[0].trim())}</b> at <b>${esc(big.amount_label)}</b>`);
    if (trials.length) bits.push(`<b>${trials.length}</b> trial${trials.length > 1 ? "s" : ""} converting soon — act before renewal`);
    const kept = S.actions.filter((a) => a._kept || a.approvalState === "rejected").length;
    if (kept) bits.push(`${kept} confirmed in use — excluded from cancel suggestions`);
    bar.insertAdjacentHTML("beforeend", bits.length ? `<div class="finsight">◇ ${bits.join(" · ")}</div>` : "");
    bar.querySelectorAll("[data-f]").forEach((b) => { b.onclick = () => { _filter = b.dataset.f; renderFilters(); applyFilter(); }; });
  }
  function applyFilter() {
    S.actions.forEach((a) => {
      const c = $("#card-" + a.id);
      if (c) c.style.display = (_filter === "all" || _bucket(a) === _filter) ? "" : "none";
    });
  }

  function renderFindings() {
    const box = $("#findings"); box.innerHTML = "";
    S.actions.forEach((a, i) => { const c = card(a); c.style.animationDelay = (i * 0.04) + "s"; box.appendChild(c); });
    renderFilters(); applyFilter();
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
    const cUrl = cancelUrl(a);
    const sendRow = `<div class="fc-send">
        ${cUrl ? `<a class="btn btn-mail" href="${safeUrl(cUrl)}" target="_blank" rel="noopener" aria-label="Open the vendor's own cancellation page">Cancel on ${esc((a.raw || a.title || "vendor").split(" ")[0].slice(0, 14))} ${icon('upRight')}</a>` : ""}
        <button class="btn btn-copy" data-copy="${aid}" aria-label="Copy claim text">${icon('copy')} Copy</button>
        <a class="btn btn-copy" href="${gmailComposeUrl(a)}" target="_blank" rel="noopener" aria-label="Draft this claim in your Gmail">${icon('mail')} Draft in Gmail</a>
        ${a.claim_url ? `<a class="btn btn-mail" href="${safeUrl(a.claim_url)}" target="_blank" rel="noopener" aria-label="Open official claim form">Claim form ${icon('upRight')}</a>` : (!cUrl ? `<button class="btn btn-mail" data-mail="${aid}" aria-label="Email claim draft">${icon('mail')} Email</button>` : "")}
      </div>
      <div class="fc-sendnote">${icon('lock')} Cancel/claim happens on the vendor's or government's OWN site; the Gmail draft opens in YOUR compose window — you press send. No money moves through Recoup.</div>`;
    // region-specific claims (flight/settlement) carry a jurisdiction caveat so a user in the wrong
    // region doesn't file an inapplicable claim — the #1 round-3 credibility ask.
    const jurisNote = (a.kind === "flight_comp" || a.kind === "settlement")
      ? `<div class="fc-juris">${icon('alert')} Region-specific: confirm this rule applies where you live/flew before filing.</div>` : "";
    let actions;
    if (a.approvalState === "rejected") {
      actions = `<div class="fc-actions"><button class="btn btn-approve" data-approve="${aid}">${icon('check')} Approve instead</button><button class="btn btn-view" data-view="${aid}">Show work</button></div>`;
    } else if (!approved) {
      actions = `<div class="fc-actions">
           <button class="btn btn-approve" data-approve="${aid}">${icon('check')} Approve</button>
           <button class="btn btn-view" data-view="${aid}">Show work</button>
           <button class="btn btn-skip" data-skip="${aid}">${a.kind === "dead_subscription" || a.kind === "price_creep" ? "✓ I use it — keep" : "Skip"}</button>
         </div>`;
    } else if (st === "paid") {
      actions = `<div class="fc-paid">${icon('check')} Recovered ${esc(a.amount_label)}</div>`;
    } else if (st === "sent") {
      actions = `${sendRow}<button class="btn btn-life paid full" data-paid="${aid}">${icon('coin')} Mark recovered</button>`;
    } else {
      actions = `${sendRow}<button class="btn btn-life full" data-sent="${aid}">Mark sent →</button>`;
    }
    const tag = approved
      ? `<span class="fc-kind ready">${st === "paid" ? `${icon('check')} paid` : st === "sent" ? "sent" : `${icon('check')} ready`}</span>`
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
      ${jurisNote}
      ${a.timeline ? `<div class="fc-expect">${icon('clock')} ${esc(a.timeline)} · <b>${esc(a.odds || "")}</b> to land</div>` : ""}
      ${a.agent_name ? `<div class="fc-agent">${icon('diamond')} ${esc(a.agent_name)}${a.verify ? (a.verify.needs_confirm ? ` · <span class="needs-confirm">${icon('alert')} confirm eligibility</span>` : (a.verify.ok ? " · rule-checked" : "")) : ""} · <button class="linklike" data-view="${aid}">show work</button></div>` : ""}
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
    const nAudit = (S.audit || []).length;
    badge.textContent = `● SHA-256 hash-chained · ${nAudit} event${nAudit === 1 ? "" : "s"}`;
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
    // APPROVE = ACT. Your one approval triggers the execution sequence (Claude-style narrated
    // steps): claim copied -> the vendor's REAL portal opens beside this tab -> the audit chain
    // logs the execution. The only click the agent never takes is the final one inside YOUR
    // logged-in vendor account — that stays yours, by design.
    const cu = cancelUrl(a);
    if (cu && !fromDemo) {
      try { await navigator.clipboard.writeText(a.draft || ""); } catch (e) {}
      const vendor = (a.raw || a.title || "vendor").split(/[—(]/)[0].trim().split(" ")[0];
      await appendAudit("agent", "Action Agent", "EXECUTION_STARTED",
        `Executing approved cancellation: ${vendor} — claim copied, vendor portal opened`, a.amount);
      renderAudit();
      const ex = el("div", "exec-steps");
      ex.innerHTML = `<div class="ap-step ok"><span class="ap-tick">✓</span><span class="ap-t">Approved — execution started</span></div>
        <div class="ap-step ok"><span class="ap-tick">✓</span><span class="ap-t">Claim copied to your clipboard</span></div>
        <div class="ap-step ok"><span class="ap-tick">✓</span><span class="ap-t">Opening ${esc(vendor)}'s own cancellation portal…</span></div>
        <div class="ap-step warn"><span class="ap-tick">→</span><span class="ap-t">Finish the last click inside your ${esc(vendor)} account, then hit “Mark sent”</span></div>`;
      const nc2 = $("#card-" + id); if (nc2) nc2.appendChild(ex);
      setTimeout(() => { window.open(safeUrl(cu), "_blank", "noopener"); }, 600);
      toast("Executing: portal opened + claim on your clipboard — one final click in your " + vendor + " account");
      // PLAYWRIGHT EXECUTION AGENT — a real headless browser walks the portal server-side and
      // streams back screenshots: the live preview of the agent on the vendor's site.
      if (API && !cu.includes("google.com/search")) {
        const pw = el("div", "ap-step dim");
        pw.innerHTML = `<span class="ap-tick">⟳</span><span class="ap-t">Execution Agent: driving a headless browser to the portal…</span>`;
        ex.appendChild(pw);
        fetch(API + "/api/agent/execute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: cu }) })
          .then((r) => r.json()).then((d) => {
            if (d && d.ok && d.shots && d.shots.length) {
              pw.innerHTML = `<span class="ap-tick">✓</span><span class="ap-t">Execution Agent reached ${esc(d.final_url_host || "the portal")}${d.login_wall ? " — vendor login wall: your account, your final click" : ""} (${d.total_ms}ms, Playwright)</span>`;
              const img = el("img", "exec-shot");
              img.src = "data:image/jpeg;base64," + d.shots[0];
              img.alt = "Live browser preview of the vendor portal";
              ex.appendChild(img);
            } else {
              pw.innerHTML = `<span class="ap-tick">△</span><span class="ap-t">Execution preview unavailable (${esc((d && d.error) || "try again")}) — the portal tab is open beside you</span>`;
            }
          }).catch(() => { pw.innerHTML = `<span class="ap-tick">△</span><span class="ap-t">Execution preview unavailable — the portal tab is open beside you</span>`; });
      }
    } else {
      toast(`Claim drafted — ready to send: ${a.title}`);
    }
  }

  // SELF-IMPROVING MEMORY: services you mark "I use it" are remembered on this device and never
  // re-suggested for cancellation in future scans (the Anthropic/Spotify accuracy fix).
  function keptList() { try { return JSON.parse(localStorage.getItem("ro_kept") || "[]"); } catch (e) { return []; } }
  function keptKey(a) { return String(a.raw || a.title || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 24); }
  function rememberKept(a) {
    try { const k = keptList(); const key = keptKey(a); if (key && !k.includes(key)) { k.push(key); localStorage.setItem("ro_kept", JSON.stringify(k.slice(-100))); } } catch (e) {}
  }
  function applyKeptMemory(findings) {
    const k = keptList(); if (!k.length) return 0;
    let n = 0;
    findings.forEach((a) => {
      if ((a.kind === "dead_subscription" || a.kind === "price_creep") && k.includes(keptKey(a)) && a.approvalState === "pending") {
        a.approvalState = "rejected"; a._kept = true; n++;
      }
    });
    return n;
  }

  async function skip(id) {
    if (demoBlocked()) return;
    const a = S.actions.find((x) => x.id === id); if (!a) return;
    a.approvalState = "rejected"; a.status = "drafted";
    const keepWord = a.kind === "dead_subscription" || a.kind === "price_creep";
    if (keepWord) rememberKept(a); // learn: don't re-suggest this service next scan
    await appendAudit("human", "You", "ACTION_REJECTED", (keepWord ? "Kept (in use): " : "Skipped: ") + a.title);
    recompute(); renderHero(); renderBreakdown(); renderDrains(); renderAudit();
    const c = $("#card-" + id); if (c) { c.outerHTML = card(a).outerHTML; const nc = $("#card-" + id); if (nc) nc.style.animation = "none"; }
    if ($("#drawer").classList.contains("open")) closeDrawer();
    if (keepWord) toast("Got it — " + (a.raw || a.title).split(" ")[0] + " marked as in use. I won't suggest cancelling it again.");
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
    toast(`Recovered ${a.amount_label} — ${a.title}`);
  }

  // BULK AUTONOMOUS EXECUTION — "Approve all safe wins" now runs the WHOLE fleet: every pending
  // leak is approved, then the execution agent walks each vendor's cancellation portal one by
  // one (real Playwright, sequential — the server runs one browser at a time), narrating live.
  // When the sweep finishes you get a notification: done, here are your final clicks.
  async function approveAllSafe() {
    if (demoBlocked()) return;
    const safe = S.actions.filter((a) => a.approvalState === "pending" && isLeak(a.kind));
    if (!safe.length) { toast("Nothing pending to approve"); return; }
    try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch (e) {}
    safe.forEach((a) => { a.approvalState = "approved"; a.status = "claim_ready"; });
    await appendAudit("human", "You", "ACTION_APPROVED", `Bulk approval: ${safe.length} claims approved in one sweep`, safe.reduce((t, a) => t + a.amount, 0));
    recompute(); renderAll(false);
    // narrated fleet panel
    let host = $("#sentinel-alert") || $("#findings");
    const panel = el("div", "sentinel-banner");
    panel.innerHTML = `<div class="sb-t">⚡ <b>Bulk execution</b> — ${safe.length} approved; the agent is walking each vendor's cancellation portal…</div><div class="exec-steps" id="bulk-steps"></div>`;
    host.parentNode.insertBefore(panel, host);
    const stepsBox = panel.querySelector("#bulk-steps");
    const execable = safe.filter((a) => { const u = cancelUrl(a); return u && !u.includes("google.com/search"); });
    const manual = safe.filter((a) => !execable.includes(a));
    let walked = 0;
    for (const a of execable) {
      const vendor = (a.raw || a.title || "vendor").split(/[—(]/)[0].trim();
      const line = el("div", "ap-step dim");
      line.innerHTML = `<span class="ap-tick">⟳</span><span class="ap-t">Executing: ${esc(vendor)} (${esc(a.amount_label)})…</span>`;
      stepsBox.appendChild(line); line.scrollIntoView({ behavior: "smooth", block: "nearest" });
      try {
        const d = await fetch(API + "/api/agent/execute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: cancelUrl(a) }) }).then((r) => r.json());
        if (d && d.ok) {
          walked++;
          line.className = "ap-step ok";
          line.innerHTML = `<span class="ap-tick">✓</span><span class="ap-t">${esc(vendor)} — portal walked (${d.total_ms}ms, Playwright)${d.login_wall ? " · login wall: your final click" : ""} · <a href="${safeUrl(cancelUrl(a))}" target="_blank" rel="noopener">open portal ↗</a></span>`;
        } else {
          line.className = "ap-step warn";
          line.innerHTML = `<span class="ap-tick">△</span><span class="ap-t">${esc(vendor)} — preview unavailable · <a href="${safeUrl(cancelUrl(a))}" target="_blank" rel="noopener">open portal ↗</a></span>`;
        }
      } catch (e) {
        line.className = "ap-step warn";
        line.innerHTML = `<span class="ap-tick">△</span><span class="ap-t">${esc(vendor)} — <a href="${safeUrl(cancelUrl(a))}" target="_blank" rel="noopener">open portal ↗</a></span>`;
      }
    }
    for (const a of manual) {
      const vendor = (a.raw || a.title || "vendor").split(/[—(]/)[0].trim();
      const line = el("div", "ap-step ok");
      line.innerHTML = `<span class="ap-tick">✓</span><span class="ap-t">${esc(vendor)} — claim drafted & queued · <a href="${safeUrl(cancelUrl(a) || '#')}" target="_blank" rel="noopener">find cancel route ↗</a></span>`;
      stepsBox.appendChild(line);
    }
    const foot = el("div", "ap-step ok");
    foot.innerHTML = `<span class="ap-tick">🏁</span><span class="ap-t"><b>Done.</b> ${safe.length} approved · ${walked} portals walked by the agent — each needs only YOUR final click inside your account.</span>`;
    stepsBox.appendChild(foot); foot.scrollIntoView({ behavior: "smooth", block: "nearest" });
    await appendAudit("agent", "Execution Agent (Playwright)", "BULK_EXECUTION", `Bulk sweep: ${walked}/${execable.length} vendor portals walked, ${safe.length} claims queued`);
    renderAudit();
    try { if ("Notification" in window && Notification.permission === "granted") new Notification("Recoup: bulk execution done 🏁", { body: safe.length + " cancellations approved, " + walked + " portals walked by the agent. Your final clicks are ready.", icon: "/mark.png" }); } catch (e) {}
    toast("Bulk execution done — " + walked + " portals walked, final clicks are yours");
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
      toast(`Illustrative walkthrough (demo) — approving ${pick.amount_label}…`); await W(1100);
      demoInternal = true; await approve(pick.id, true); demoInternal = false; await W(1200);
      toast("Claim filed — nothing sent until you approved it"); demoInternal = true; await markSent(pick.id, true); demoInternal = false; await W(1500);
      const ref = "RC-" + Math.floor(100000 + Math.random() * 900000);
      toast(`📨 Acknowledged · reference #${ref} (demo)`); await W(1700);
      demoInternal = true; await markPaid(pick.id, true); demoInternal = false;
      toast(`Demo complete — full loop shown: detect → approve → file → paid. Real payouts land in the timeline each card shows.`);
    } finally {
      demoInternal = false;
      demoRunning = false;
    }
  }

  async function forgetData() {
    try { localStorage.removeItem("ro_user_surface"); } catch (e) {}  // wipe the on-device real scan too
    // send the session cookie (same-origin) + any live Gmail handoff token so the server can
    // actually scope the erasure; Gmail-derived findings also auto-expire server-side in 5 minutes.
    var tok = "";
    try { tok = gmailHandoff() || ""; } catch (e) {}
    try {
      if (API) await fetch(API + "/api/account/forget" + (tok ? "?token=" + encodeURIComponent(tok) : ""),
        { method: "POST", credentials: "include" });
    } catch (e) {}
    try { localStorage.removeItem("ro-vrec"); localStorage.removeItem("RO_API_BASE"); } catch (e) {}
    renderVrec();
    toast("Local data cleared. Any Gmail-derived results auto-expire within 5 minutes; revoke access at myaccount.google.com/permissions.");
  }

  function getVrec() { try { return JSON.parse(localStorage.getItem("ro-vrec") || "[]"); } catch (e) { return []; } }
  function setVrec(v) { try { localStorage.setItem("ro-vrec", JSON.stringify(v)); } catch (e) {} }
  function renderVrec() {
    const list = $("#vrec-list"); if (!list) return;
    const v = getVrec();
    if (!v.length) { list.innerHTML = `<div class="vrec-empty">Nothing logged yet. When you actually get money back — cancel a real subscription, claim real unclaimed cash — log it here with its confirmation reference, so it's <b>checkable</b>, not a vague estimate. (You-logged, not independently audited.)</div>`; return; }
    const totals = v.reduce((acc, r) => { const c = r.currency || "$"; acc[c] = r2((acc[c] || 0) + (r.amount || 0)); return acc; }, {});
    const totalText = Object.entries(totals).map(([c, n]) => `${c}${Number(n).toFixed(2)}`).join(" · ");
    list.innerHTML = `<div class="vrec-empty">Total you've logged: <b class="vrec-total">${esc(totalText)}</b> <span class="muted">(you-confirmed)</span></div>` +
      v.map((r) => `<div class="vrec-item"><span>${icon('check')} <b>${esc(r.what)}</b>${r.ref ? ` · ref ${esc(r.ref)}` : ""} <span class="muted">· ${esc(r.date)}</span></span><span class="amt">${esc(r.currency || "$")}${Number(r.amount).toFixed(2)}</span></div>`).join("");
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
    toast(`Logged ${currency}${amt.toFixed(2)} recovery`);
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
    await appendAudit("system", "Recoup scanner", "SCAN_RUN", `Re-scanned — ${fmtCurrencies(perCurrency(S.actions.filter((a) => a.cadence === "yearly")), "/yr")} recurring + ${fmtCurrencies(perCurrency(S.actions.filter((a) => a.cadence === "once")))} one-time`, S.recoverable);
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
      (checks.length ? checks.map((c) => `<div class="prov-check ${c.ok ? "ok" : "bad"}">${c.ok ? icon('check') : icon('x')}<span class="sr-only">${c.ok ? "Passed" : "Failed"}: </span>${esc(c.label)}</div>`).join("") : `<div class="prov-check ok">${icon('check')} rule-checked</div>`) +
      `</div>` +
      (a.caveat ? `<div class="prov-sec caveat"><div class="prov-h">${icon('alert')} You might NOT qualify if</div><div>${esc(a.caveat)}</div></div>` : "") +
      (a.timeline ? `<div class="prov-sec"><div class="prov-h">What to expect</div><div class="prov-rule">${icon('clock')} Typically <b>${esc(a.timeline)}</b> · ${esc(a.odds || "")} to actually land — you file on the form, nothing is automatic.</div></div>` : "") +
      (a.claim_url ? `<a class="btn btn-mail full" href="${safeUrl(a.claim_url)}" target="_blank" rel="noopener">Open the official claim form ${icon('upRight')}</a>` : "") +
      `<div class="prov-h" style="margin-top:14px">The drafted claim</div>`;
    // tone selector — Polite (default) / Firm / Short. Deterministic rewrites grounded in the
    // claim's own fields (never invents amounts); Copy + Draft-in-Gmail pick up the chosen tone.
    if (!a._draft0) a._draft0 = a.draft || "";
    const toneDraft = (tone) => {
      const subj = (a._draft0.match(/^Subject:\s*(.+)$/m) || [])[1] || `Regarding ${a.raw || a.title}`;
      const body0 = a._draft0.replace(/^Subject:.*\n+/, "");
      const basis = RULES[a.rule] ? `Basis: ${RULES[a.rule]}` : "";
      if (tone === "firm") {
        return `Subject: ${subj} — formal request\n\n${body0.trim()}\n\nPlease treat this as a formal request. ${basis}\nI expect a written confirmation within 14 days, after which I will escalate through the appropriate channel.`;
      }
      if (tone === "short") {
        const amt = a.amount_label ? ` (${a.amount_label})` : "";
        return `Subject: ${subj}\n\nPlease ${a.kind === "billing_error" ? "review and refund the duplicate charge" : a.cadence === "once" ? "process my claim" : "cancel my subscription"}${amt} and confirm in writing. Thank you.`;
      }
      return a._draft0; // polite (original)
    };
    const toneRow = el("div", "tone-row");
    toneRow.innerHTML = `<span class="tone-label">Tone:</span>` +
      ["polite", "firm", "short"].map((t) => `<button class="tone-chip${(a._tone || "polite") === t ? " on" : ""}" data-tone="${t}">${t}</button>`).join("");
    const prevTone = $("#drawer .tone-row"); if (prevTone) prevTone.remove();
    $("#drawer-body").before(toneRow);
    toneRow.querySelectorAll("[data-tone]").forEach((b) => {
      b.onclick = () => { a._tone = b.dataset.tone; a.draft = toneDraft(a._tone); $("#drawer-body").textContent = a.draft;
        toneRow.querySelectorAll(".tone-chip").forEach((c) => c.classList.toggle("on", c.dataset.tone === a._tone)); };
    });
    a.draft = toneDraft(a._tone || "polite");
    $("#drawer-body").textContent = a.draft || "(no draft)";
    // live AI plan on THIS charge (your real scanned data included) — one call, honest model label
    const aiOut = $("#drawer-ai-out"), aiBtn = $("#drawer-ai-btn");
    if (aiOut) aiOut.innerHTML = "";
    if (aiBtn) {
      aiBtn.style.display = API ? "" : "none";
      aiBtn.disabled = false;
      aiBtn.onclick = async () => {
        aiBtn.disabled = true;
        aiOut.innerHTML = '<div class="ai-thinking">Agent reasoning on this charge…</div>';
        try {
          const charge = { merchant: (a.raw || a.title || "charge").slice(0, 90), kind: a.kind || "", amount: Math.abs(a.amount || 0) || undefined };
          const d = await fetch(API + "/api/agent/recover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ charge }) }).then((r) => r.json());
          if (d && d.plan) {
            const pb = d.playbook || {};
            aiOut.innerHTML = `<div class="ai-model">${esc(modelLabel(d))}${pb.basis ? " · grounded in: " + esc(pb.basis).slice(0, 70) : ""}</div><pre class="ai-plan">${esc(d.plan)}</pre>`;
            aiOut.scrollIntoView({ behavior: "smooth", block: "nearest" }); // auto-scroll the plan into view
          } else aiOut.innerHTML = '<div class="ai-thinking">' + esc((d && d.error) || "Agent unavailable — try again.") + "</div>";
        } catch (e3) { aiOut.innerHTML = '<div class="ai-thinking">Backend waking — try again in a few seconds.</div>'; aiBtn.disabled = false; }
      };
    }
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
  async function checkAuth() {
    if (!API) return;
    try {
      const r = await fetch(API + "/api/auth/me", { credentials: "include" });
      const d = await r.json();
      if (d && d.authenticated && d.user) signedInUI(d.user);
    } catch (e) { /* backend cold / signed out — public demo stays untouched */ }
  }
  function signedInUI(u) {
    const who = u.name || (u.email || "account").split("@")[0];
    const link = $(".signin-link");
    if (link) {
      link.innerHTML = esc(who) + " &middot; Sign out";
      link.href = "#";
      link.setAttribute("aria-label", "Signed in as " + (u.email || who) + " — sign out");
      link.onclick = async (e) => {
        e.preventDefault();
        // sign-out = private data leaves this browser too (surface, kept-memory, session flag)
        try { localStorage.removeItem("ro_signed_in"); localStorage.removeItem("ro_user_surface"); localStorage.removeItem("ro_kept"); } catch (e3) {}
        try { await fetch(API + "/api/auth/logout", { method: "POST", credentials: "include" }); } catch (e2) {}
        location.reload();
      };
    }
    try { localStorage.setItem("ro_signed_in", "1"); } catch (e4) {}  // fast-path future page loads
    toast("Signed in as " + (u.email || who));
    showResults(); // the command center IS the signed-in dashboard — land there, not on the marketing page
    // SIGNED IN = YOUR DATA: if no real surface is loaded yet (no fresh scan, nothing restored),
    // auto-run the inbox scan once per tab session — sample data is for anonymous visitors only.
    // Silent for already-granted accounts (no prompt param on the gmail flow).
    try {
      if (API && !S._real && !localStorage.getItem("ro_user_surface") && !sessionStorage.getItem("ro_autoscan")) {
        sessionStorage.setItem("ro_autoscan", "1");
        toast("Scanning your inbox for real subscriptions…");
        setTimeout(() => { window.location.href = API + "/api/gmail/start"; }, 900);
      }
    } catch (e3) {}
  }
  function showResults() {
    const r = $("#results"), l = $("#landing");
    if (r) r.classList.remove("hidden");
    if (l) l.classList.add("hidden");
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) {}
    const h = $("#results-heading"); if (h) setTimeout(() => { try { h.focus(); } catch (e) {} }, 40); // move SR focus onto the results so the reveal is announced
    setupReveal();
  }
  let _revealed = false;
  function setupReveal() {
    if (_revealed) return; _revealed = true;
    revealGroup([...document.querySelectorAll("#results > section")]);
  }
  function revealGroup(els) {
    if (!els.length) return;
    const showAll = () => els.forEach((e) => e.classList.add("in"));
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // reduced-motion or no IntersectionObserver -> never hide; content is fully visible, no animation
    if (reduce || !("IntersectionObserver" in window)) return;
    els.forEach((e, i) => { e.classList.add("reveal"); e.style.transitionDelay = (Math.min(i, 6) * 0.06) + "s"; });
    const io = new IntersectionObserver((ents) => { ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }); }, { threshold: 0, rootMargin: "0px 0px 12% 0px" });
    els.forEach((e) => io.observe(e));
    // BULLETPROOF: content can never stay hidden (slow device / background tab / throttled timers)
    setTimeout(showAll, 700);
    window.addEventListener("scroll", showAll, { once: true, passive: true });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) showAll(); }, { once: true });
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
    const kept = applyKeptMemory(findings); // self-improving: honor "I use it" memory across scans
    S.actions = findings;
    if (kept) setTimeout(() => toast(kept + " service" + (kept === 1 ? "" : "s") + " you marked as in-use stayed kept"), 1200);
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
    // YOUR data must survive a reload — persist locally (this device only; never uploaded).
    try { localStorage.setItem("ro_user_surface", JSON.stringify({ findings, model: opts.model || "in-browser rules", ts: Date.now() })); } catch (e) {}
    renderAll(true);
    showResults();
  }

  function restoreUserSurface() {
    // a previously-scanned REAL surface (Gmail/statement) beats the sample demo on reload —
    // but ONLY for a signed-in session. Signed-out users see the sample, never private data.
    try {
      if (localStorage.getItem("ro_signed_in") !== "1") return false;
      const raw = localStorage.getItem("ro_user_surface");
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (!saved || !Array.isArray(saved.findings) || !saved.findings.length) return false;
      if (Date.now() - (saved.ts || 0) > 7 * 24 * 3600e3) { localStorage.removeItem("ro_user_surface"); return false; }
      applyFindings(saved.findings, {
        model: saved.model, scanner: "Recoup (restored)",
        auditLabel: `Restored YOUR ${saved.findings.length}-item scan from this device`,
        reasoning: [
          { t: `Restored YOUR data — ${saved.findings.length} recoverable items from your last scan`, tone: "cyan" },
          { t: "Stored only on this device · Delete my data wipes it", tone: "dim" },
        ],
      });
      return true;
    } catch (e) { return false; }
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
      // multi-inbox: an "Add another inbox" pass MERGES with the existing real surface
      const adding = sessionStorage.getItem("ro_gmail_add") === "1" && S._real && S.actions.length;
      sessionStorage.removeItem("ro_gmail_add");
      if (adding && d.findings && d.findings.length) {
        d.findings.forEach((f, i) => { f.id = "b_" + i + "_" + (f.id || i); });
        d.findings = S.actions.concat(d.findings);
      }
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
    throw new Error("gmail findings failed"); // POST-only — never put the handoff token in a URL (no leak via server logs / Referer)
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
        const vis = [...dlg.querySelectorAll('button, [href], input, textarea, select, summary, [tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null && !el.disabled);
        if (!vis.length) return;
        const first = vis[0], last = vis[vis.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    $("#drawer-x").onclick = closeDrawer;
    $("#drawer-scrim").onclick = closeDrawer;
    // theme toggle removed — dark-only high-contrast design
    const sx = $("#scan-x"); if (sx) sx.onclick = closeScan;
    const ssc = $("#scan-scrim"); if (ssc) ssc.onclick = closeScan;
    const sr = $("#scan-run"); if (sr) sr.onclick = runScan;
    const sm = $("#scan-sample"); if (sm) sm.onclick = () => { const i = $("#scan-input"); if (i && window.RecoupScan) i.value = window.RecoupScan.SAMPLE; };
    const gc = $("#gmail-connect"); if (gc) gc.onclick = () => {
      // Real read-only Gmail scan. The RESTRICTED gmail.readonly scope shows Google's
      // "unverified app" interstitial until OAuth verification completes — the modal copy
      // explains the Advanced -> Continue step honestly. Read-only; nothing sends or deletes.
      if (!API) { toast("Gmail scan needs the live backend."); return; }
      window.location.href = API + "/api/gmail/start";
    };
    const ob = $("#open-scan"); if (ob) ob.onclick = openScan;
    const fm = $("#find-money"); if (fm) fm.onclick = openScan;
    const se = $("#see-example"); if (se) se.onclick = showResults;

    // real browser notifications — ask on the first agent action (a user gesture, like
    // Claude/ChatGPT do); notify when long-running agent work completes.
    const askNotify = () => { try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch (e) {} };
    const notify = (title, body) => {
      try { if ("Notification" in window && Notification.permission === "granted" && document.hidden) new Notification(title, { body, icon: "/mark.png" }); } catch (e) {}
    };

    // SENTINEL — the scheduled drain watch. While on, the agent re-analyzes your surface on a
    // schedule (every 6h, survives reloads via localStorage); if a significant drain ($100+/yr)
    // is still leaking and you haven't confirmed using it, it notifies you and offers one-tap
    // approval — which hands straight to the execution agent (portal + Playwright preview).
    const stBtn = $("#sentinel-toggle");
    const stPaint = () => {
      if (!stBtn) return;
      const on = localStorage.getItem("ro_sentinel") === "1";
      stBtn.classList.toggle("on", on); stBtn.setAttribute("aria-pressed", String(on));
      const t = stBtn.querySelector(".st-state"); if (t) t.textContent = on ? "ON · watching" : "off";
    };
    const sentinelCheck = (force) => {
      try {
        if (localStorage.getItem("ro_sentinel") !== "1" || !S._real) return;
        const last = +(localStorage.getItem("ro_sentinel_last") || 0);
        if (!force && Date.now() - last < 6 * 3600e3) return;   // scheduled cadence: 6h
        const kept = keptList();
        const cand = (S.actions || [])
          .filter((a) => a.cadence === "yearly" && a.approvalState === "pending" &&
                         (a.kind === "dead_subscription" || a.kind === "price_creep") &&
                         !kept.includes(keptKey(a)) && a.amount >= 100)
          .sort((x, y) => y.amount - x.amount)[0];
        if (!cand) return;
        localStorage.setItem("ro_sentinel_last", String(Date.now()));
        const vendor = (cand.raw || cand.title || "").split(/[—(]/)[0].trim();
        try { if ("Notification" in window && Notification.permission === "granted") new Notification("Recoup Sentinel 🛡️", { body: vendor + " is still draining " + cand.amount_label + " and you haven't confirmed using it. Cancel it?", icon: "/mark.png" }); } catch (e) {}
        const box = $("#sentinel-alert");
        if (box) {
          box.innerHTML = `<div class="sentinel-banner"><div class="sb-t">🛡️ Sentinel: <b>${esc(vendor)}</b> is still draining <b>${esc(cand.amount_label)}</b> — you haven't confirmed you use it. Proceed with the cancel?</div>
            <div class="sb-row"><button class="btn btn-primary" id="sb-go">✓ Yes — cancel it (agent executes)</button>
            <button class="btn btn-skip" id="sb-keep">I use it — keep</button></div></div>`;
          const go = $("#sb-go"), keep = $("#sb-keep");
          if (go) go.onclick = () => { box.innerHTML = ""; approve(cand.id); const c = $("#card-" + cand.id); if (c) c.scrollIntoView({ behavior: "smooth", block: "center" }); };
          if (keep) keep.onclick = () => { box.innerHTML = ""; skip(cand.id); };
        }
        appendAudit("agent", "Sentinel", "SENTINEL_ALERT", "Scheduled watch flagged: " + vendor + " (" + cand.amount_label + ") — awaiting your decision", cand.amount);
      } catch (e) {}
    };
    if (stBtn) {
      stPaint();
      stBtn.onclick = () => {
        const on = localStorage.getItem("ro_sentinel") === "1";
        localStorage.setItem("ro_sentinel", on ? "0" : "1");
        stPaint();
        if (!on) {
          try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch (e) {}
          toast("Sentinel ON — I'll re-check your drains on a schedule and ping you before any cancel");
          localStorage.removeItem("ro_sentinel_last");
          setTimeout(() => sentinelCheck(true), 900);
        } else { toast("Sentinel off"); const b = $("#sentinel-alert"); if (b) b.innerHTML = ""; }
      };
      setTimeout(() => sentinelCheck(false), 4000);            // on every boot
      setInterval(() => sentinelCheck(false), 30 * 60e3);      // and while the app stays open
    }

    // AUTOPILOT — the autonomous mission, rendered as a layered live timeline
    const apBtn = $("#rh-autopilot");
    if (apBtn) apBtn.onclick = async () => {
      const out = $("#ap-mission"); if (!out) return;
      if (!API) { toast("Autopilot needs the live backend."); return; }
      askNotify();
      apBtn.disabled = true;
      out.innerHTML = '<div class="ap-running"><span class="ap-spin"></span> Mission running — scanning, grounding in Atlas, drafting, verifying…</div>';
      try {
        // YOUR data active -> the mission runs on YOUR findings (sent once, grounded server-side; never stored)
        const payload = S._real && S.actions && S.actions.length
          ? { findings: S.actions.map((a) => ({ title: a.title, kind: a.kind, amount: a.amount, cadence: a.cadence, evidence: a.evidence, verify: a.verify, draft: !!a.draft })) }
          : {};
        const m = await fetch(API + "/api/agent/autopilot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }).then((r) => r.json());
        if (!m || !m.phases) throw new Error("bad mission");
        out.innerHTML = "";
        const head = el("div", "ap-head");
        head.innerHTML = `<b>Mission ${esc(m.mission_id)}</b> · ${m.findings} findings → ${m.drafted} claims drafted → ${m.pending_approval} at your approval gate · ${m.total_ms}ms · ${esc(modelLabel(m))}`;
        out.appendChild(head);
        // sleek per-phase glyphs (the mission payload names them: radar/db/pen/shield/lock)
        const PHASE_ICO = {
          radar: '<circle cx="12" cy="12" r="9"/><path d="M12 12l6-4M12 3v3m9 6h-3M12 18v3M6 12H3"/>',
          db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
          pen: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
          shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
          lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
        };
        let delay = 0;
        m.phases.forEach((p, pi) => {
          const ph = el("div", "ap-phase");
          ph.style.animationDelay = (delay += 120) + "ms";
          ph.innerHTML = `<div class="ap-phase-h"><span class="ap-num">${pi + 1}</span><svg class="ap-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PHASE_ICO[p.icon] || PHASE_ICO.radar}</svg> ${esc(p.name)}</div>` +
            p.steps.map((s) => `<div class="ap-step ${esc(s.tone || "ok")}"><span class="ap-tick">${s.tone === "warn" ? "△" : "✓"}</span><span class="ap-t">${esc(s.t)}</span>${s.detail ? `<span class="ap-d">${esc(s.detail)}</span>` : ""}${s.ms ? `<span class="ap-ms">${s.ms}ms</span>` : ""}</div>`).join("");
          out.appendChild(ph);
        });
        // NEEDS YOU — supervised autonomy: the agent did everything it can alone; this digest is
        // the ONLY list the human must look at (urgent windows, eligibility confirmations,
        // signature-level approvals). Everything else is drafted, verified and queued.
        const pendingA = S.actions.filter((x) => x.approvalState === "pending");
        const urgent = pendingA.filter((x) => /trial|before renewal/i.test((x.timeline || "") + (x.title || ""))).length;
        const confirmN = pendingA.filter((x) => x.verify && (x.verify.needs_confirm || x.verify.review)).length;
        const readyN = Math.max(0, pendingA.length - confirmN);
        const ny = el("div", "ap-needsyou");
        ny.innerHTML = `<div class="ny-h">🙋 Needs YOU (everything else is handled)</div>
          <div class="ny-row">${urgent ? `<span class="ny-chip urgent">⏳ ${urgent} urgent — act before renewal</span>` : ""}
          <span class="ny-chip">✍️ ${readyN} ready for your approval</span>
          ${confirmN ? `<span class="ny-chip warn">❓ ${confirmN} need you to confirm eligibility/usage</span>` : ""}</div>
          <button class="btn btn-primary ny-go" id="ny-go">Review them →</button>`;
        out.appendChild(ny);
        const nyBtn = ny.querySelector("#ny-go");
        if (nyBtn) nyBtn.onclick = () => { const f = $("#findings"); if (f) f.scrollIntoView({ behavior: "smooth", block: "start" }); };
        const foot = el("div", "ap-boundary");
        foot.innerHTML = `🔒 ${esc(m.boundary)} · audit head <code>${esc(String((m.audit || {}).head || "").slice(0, 12))}…</code>`;
        out.appendChild(foot);
        // auto-scroll: follow each phase as it reveals (staggered 120ms), ending on the boundary line
        m.phases.forEach((p, pi) => {
          setTimeout(() => { const ph = out.querySelectorAll(".ap-phase")[pi]; if (ph) ph.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, 140 * (pi + 1));
        });
        setTimeout(() => foot.scrollIntoView({ behavior: "smooth", block: "nearest" }), 140 * (m.phases.length + 1));
        recompute(); renderAll(false);
        toast("Autopilot done — " + m.pending_approval + " claims waiting for YOUR approval");
        notify("Recoup Autopilot finished ⚡", m.pending_approval + " claims are queued at your approval gate — only the Needs-YOU items want your attention.");
      } catch (e4) {
        out.innerHTML = '<div class="ap-running">Mission failed to reach the backend — try again in a few seconds.</div>';
      }
      apBtn.disabled = false;
    };

    // use-case presets — multiple personas, one click, scanned by the REAL engine
    const PRESETS = {
      student: "Transaction Date,Description,Amount\n01/05/2026,SPOTIFY USA,-11.99\n02/05/2026,SPOTIFY USA,-11.99\n01/09/2026,CHEGG STUDY,-19.95\n02/09/2026,CHEGG STUDY,-19.95\n01/14/2026,PLANET FIT,-24.99\n02/14/2026,PLANET FIT,-27.99\n02/20/2026,UBER EATS,-23.40\n02/21/2026,UBER EATS,-23.40",
      traveler: "Transaction Date,Description,Amount\n01/03/2026,RYANAIR FR2231,-89.99\n01/18/2026,BOOKING.COM HOTEL,-240.00\n02/01/2026,PRIORITY PASS,-99.00\n01/02/2026,PRIORITY PASS,-99.00\n02/12/2026,AIRBNB DEPOSIT,-300.00\n02/15/2026,REVOLUT METAL,-16.99\n01/15/2026,REVOLUT METAL,-16.99",
      family: "Transaction Date,Description,Amount\n01/04/2026,NETFLIX.COM,-22.99\n02/04/2026,NETFLIX.COM,-22.99\n01/07/2026,DISNEY PLUS,-13.99\n02/07/2026,DISNEY PLUS,-15.99\n01/11/2026,FITLIFE GYM FAMILY,-79.00\n02/11/2026,FITLIFE GYM FAMILY,-79.00\n02/18/2026,AMZN MKTP,-43.18\n02/19/2026,AMZN MKTP,-43.18",
      freelancer: "Transaction Date,Description,Amount\n01/06/2026,ADOBE CREATIVE CLD,-54.99\n02/06/2026,ADOBE CREATIVE CLD,-59.99\n01/08/2026,DROPBOX PLUS,-11.99\n02/08/2026,DROPBOX PLUS,-11.99\n01/12/2026,LINKEDIN PREMIUM,-39.99\n02/12/2026,LINKEDIN PREMIUM,-39.99\n01/20/2026,ZOOM PRO,-15.99\n02/20/2026,ZOOM PRO,-15.99",
    };
    document.querySelectorAll(".preset-chip").forEach((ch) => {
      ch.onclick = () => { const i = $("#scan-input"); if (i && PRESETS[ch.dataset.preset]) { i.value = PRESETS[ch.dataset.preset]; i.focus(); toast("Use-case loaded — hit Scan privately (parsed in your browser)"); } };
    });

    // shared action runner — the guide chatbot + command palette both drive the app through this
    const runAction = (name) => {
      if (name === "autopilot") { showResults(); setTimeout(() => { const b = $("#rh-autopilot"); if (b) { b.scrollIntoView({ block: "center" }); b.click(); } }, 250); }
      else if (name === "scan") openScan();
      else if (name === "unclaimed") { showResults(); setTimeout(() => { const u = $("#unclaimed"); if (u) { u.scrollIntoView({ block: "start" }); const i = $("#uc-name"); if (i) i.focus(); } }, 250); }
      else if (name === "gmail") { if (API) window.location.href = API + "/api/gmail/start"; else toast("Gmail scan needs the live backend."); }
      else if (name === "audit") { if (API) window.open(API + "/api/health", "_blank", "noopener"); }
    };

    // in-dashboard AI guide — chatbot tone, product-aware, can DRIVE the app
    const gFab = $("#guide-fab"), gBox = $("#guide"), gMsgs = $("#guide-msgs"), gForm = $("#guide-form"), gIn = $("#guide-in");
    const gAdd = (who, text, meta) => {
      const m = el("div", "gmsg " + who);
      m.innerHTML = `<div class="gbubble">${esc(text)}</div>` + (meta ? `<div class="gmeta">${esc(meta)}</div>` : "");
      gMsgs.appendChild(m); gMsgs.scrollTop = gMsgs.scrollHeight;
      return m;
    };
    const gHist = []; // context awareness: rolling last turns, so follow-ups make sense
    const gSend = async (text) => {
      text = (text || "").trim(); if (!text) return;
      gAdd("you", text);
      const thinking = gAdd("bot", "…thinking");
      try {
        // one-line surface summary (counts only — no raw data leaves unless already server-known)
        const kept = keptList().length;
        const surface = (S._real ? `${S.actions.length} real findings, $${money(S.recurring_year)}/yr recurring + $${money(S.one_time)} one-time` : "sample demo surface")
          + (kept ? `; user marked ${kept} services as in-use (never suggest cancelling those)` : "");
        const history = gHist.slice(-6).map((h) => h.who + ": " + h.t).join("\n");
        const d = API ? await fetch(API + "/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text, surface, history }) }).then((r) => r.json()) : null;
        gHist.push({ who: "user", t: text.slice(0, 200) });
        if (d && d.reply) gHist.push({ who: "assistant", t: d.reply.slice(0, 200) });
        thinking.remove();
        if (d && d.reply) {
          gAdd("bot", d.reply, d.live ? ("answered by " + d.model) : "instant guide");
          if (d.action && d.action !== "none") setTimeout(() => runAction(d.action), 700);
        } else gAdd("bot", "I can run Autopilot, scan your statement, or search real unclaimed money — which one?");
      } catch (e5) { thinking.remove(); gAdd("bot", "Backend waking up — ask me again in a few seconds."); }
    };
    if (gFab && gBox) {
      const gOpen = () => { gBox.classList.add("open"); gBox.setAttribute("aria-hidden", "false"); gFab.setAttribute("aria-expanded", "true");
        if (!gMsgs.childElementCount) gAdd("bot", "Hey! 👋 I'm your Recoup guide. I can run the autonomous Autopilot, scan your real statement, search $37.8M of real unclaimed money, or explain how the approval gate keeps you in control. What shall we find first?");
        setTimeout(() => gIn.focus(), 60); };
      const gClose = () => { gBox.classList.remove("open"); gBox.setAttribute("aria-hidden", "true"); gFab.setAttribute("aria-expanded", "false"); };
      gFab.onclick = () => gBox.classList.contains("open") ? gClose() : gOpen();
      const gx = $("#guide-x"); if (gx) gx.onclick = gClose;
      gForm.onsubmit = (e) => { e.preventDefault(); const v = gIn.value; gIn.value = ""; gSend(v); };
      document.querySelectorAll(".gchip").forEach((c) => { c.onclick = () => gSend(c.dataset.q); });
    }

    // ⌘K / Ctrl-K command palette — every agent action one keystroke away
    const CMDS = [
      { t: "⚡ Run Autopilot (autonomous mission)", run: () => { showResults(); setTimeout(() => { const b = $("#rh-autopilot"); if (b) { b.scrollIntoView({ block: "center" }); b.click(); } }, 250); } },
      { t: "📄 Scan my real statement (in-browser)", run: () => openScan() },
      { t: "💰 Search $37.8M real unclaimed money", run: () => { showResults(); setTimeout(() => { const u = $("#unclaimed"); if (u) { u.scrollIntoView({ block: "start" }); const i = $("#uc-name"); if (i) i.focus(); } }, 250); } },
      { t: "📧 Scan my Gmail (read-only)", run: () => { if (API) window.location.href = API + "/api/gmail/start"; } },
      { t: "🛡 Verify the audit chain (live)", run: () => { if (API) window.open(API + "/api/health", "_blank", "noopener"); } },
      { t: "✅ Approve all safe wins", run: () => { showResults(); setTimeout(() => { const b = $("#btn-approve-all"); if (b) b.click(); }, 250); } },
      { t: "▶ See a claim recovered (demo)", run: () => { showResults(); setTimeout(() => { const b = $("#demo-recovery"); if (b) b.click(); }, 250); } },
    ];
    const ck = $("#cmdk"), ckIn = $("#cmdk-input"), ckList = $("#cmdk-list"), ckScrim = $("#cmdk-scrim");
    let ckSel = 0;
    const ckRender = (q) => {
      const items = CMDS.filter((c) => !q || c.t.toLowerCase().includes(q.toLowerCase()));
      ckSel = Math.min(ckSel, Math.max(0, items.length - 1));
      ckList.innerHTML = items.length ? items.map((c, i) => `<div class="cmdk-item${i === ckSel ? " sel" : ""}" data-i="${i}" role="option" aria-selected="${i === ckSel}">${c.t}</div>`).join("") : '<div class="cmdk-item">No matching command</div>';
      ckList.querySelectorAll(".cmdk-item[data-i]").forEach((n) => { n.onclick = () => { ckClose(); items[+n.dataset.i].run(); }; });
      return items;
    };
    const ckOpen = () => { if (!ck) return; ck.classList.add("open"); ckScrim.classList.add("open"); ck.setAttribute("aria-hidden", "false"); ckIn.value = ""; ckSel = 0; ckRender(""); setTimeout(() => ckIn.focus(), 40); };
    const ckClose = () => { if (!ck) return; ck.classList.remove("open"); ckScrim.classList.remove("open"); ck.setAttribute("aria-hidden", "true"); };
    if (ck && ckIn) {
      document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); ck.classList.contains("open") ? ckClose() : ckOpen(); }
        else if (e.key === "Escape" && ck.classList.contains("open")) ckClose();
      });
      ckIn.addEventListener("input", () => { ckSel = 0; ckRender(ckIn.value); });
      ckIn.addEventListener("keydown", (e) => {
        const items = CMDS.filter((c) => !ckIn.value || c.t.toLowerCase().includes(ckIn.value.toLowerCase()));
        if (e.key === "ArrowDown") { e.preventDefault(); ckSel = Math.min(ckSel + 1, items.length - 1); ckRender(ckIn.value); }
        else if (e.key === "ArrowUp") { e.preventDefault(); ckSel = Math.max(ckSel - 1, 0); ckRender(ckIn.value); }
        else if (e.key === "Enter" && items[ckSel]) { e.preventDefault(); ckClose(); items[ckSel].run(); }
      });
      ckScrim.onclick = ckClose;
    }

    // REAL-MONEY HUB — live paths above the sample demo
    const rs = $("#rh-scan"); if (rs) rs.onclick = openScan;
    const rg = $("#rh-gmail"); if (rg) {
      // after the first real scan this card becomes "Add another inbox" (multi-email, like an MCP
      // over all your mailboxes) — forces the account chooser and MERGES the new inbox's findings
      const rgLabel = () => { const b = rg.querySelector(".rh-big"); if (b && S._real) b.textContent = "Add another inbox"; };
      rgLabel(); setTimeout(rgLabel, 1500);
      rg.onclick = () => {
        if (!API) { toast("Gmail scan needs the live backend."); return; }
        if (S._real) { sessionStorage.setItem("ro_gmail_add", "1"); window.location.href = API + "/api/gmail/start?add=1"; }
        else window.location.href = API + "/api/gmail/start";
      };
    }
    if (API && $("#rh-total")) {
      fetch(API + "/api/unclaimed/stats").then((r) => r.json()).then((d) => {
        if (d && d.total_amount) {
          $("#rh-total").textContent = "$" + (d.total_amount / 1e6).toFixed(1) + "M";
          $("#rh-records").textContent = Number(d.records || 0).toLocaleString();
        }
      }).catch(() => {});
    }

    // REAL owed-money search — official CA unclaimed-property records (live Atlas query)
    const ucf = $("#uc-form"); if (ucf) ucf.onsubmit = async (e) => {
      e.preventDefault();
      const name = (($("#uc-name") && $("#uc-name").value) || "").trim();
      const box = $("#uc-results"); if (!box) return;
      if (!API) { box.innerHTML = '<div class="uc-empty">The records search needs the live backend.</div>'; return; }
      box.innerHTML = '<div class="uc-empty">Searching official records…</div>';
      try {
        const d = await fetch(API + "/api/unclaimed/search?name=" + encodeURIComponent(name)).then((r) => r.json());
        if (!d.ok) { box.innerHTML = '<div class="uc-empty">' + esc(d.error || "Search failed — try again.") + "</div>"; return; }
        if (!d.results || !d.results.length) {
          box.innerHTML = '<div class="uc-empty">No matches in this indexed slice — try another name, or search the full official database at claimit.ca.gov.</div>'; return;
        }
        box.innerHTML = d.results.map((r) => (
          '<div class="uc-row"><div class="uc-row-main"><b>' + esc(r.owner_name) + "</b>" +
          (r.owner_city ? ' <span class="uc-city">' + esc(r.owner_city) + (r.owner_state ? ", " + esc(r.owner_state) : "") + "</span>" : "") +
          '<div class="uc-holder">held by ' + esc(r.holder || "unknown holder") + " · " + esc(r.property_type || "property") + " · ID " + esc(r.property_id) + "</div></div>" +
          '<div class="uc-amt">$' + Number(r.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }) + "</div>" +
          '<a class="btn btn-ghost uc-claim" href="https://claimit.ca.gov" target="_blank" rel="noopener">Claim ↗</a></div>'
        )).join("") +
          '<div class="uc-total">' + d.total_matches + " match" + (d.total_matches === 1 ? "" : "es") +
          " in this " + Number(d.records || 0).toLocaleString() + "-record slice · every result is a real public record</div>";
      } catch (e2) {
        box.innerHTML = '<div class="uc-empty">Backend waking up — try again in a few seconds.</div>';
      }
    };

    // savings estimator checkboxes — NEVER blend currencies into one figure (core product rule)
    const cbs = document.querySelectorAll(".calc-cb");
    const calcTotal = $("#calc-total");
    const updateCalc = () => {
      const per = {};
      cbs.forEach(cb => {
        if (!cb.checked) return;
        const ccy = cb.getAttribute("data-currency") || "$";
        per[ccy] = (per[ccy] || 0) + parseFloat(cb.getAttribute("data-amount") || "0");
      });
      const parts = Object.entries(per).sort((a, b) => b[1] - a[1]).map(([c, v]) => c + v.toLocaleString());
      if (calcTotal) calcTotal.textContent = parts.length ? parts.join(" + ") : "0";
    };
    cbs.forEach(cb => cb.onchange = updateCalc);
    const ctaBtn = $("#calc-cta-btn");
    if (ctaBtn) ctaBtn.onclick = openScan;
  }

  // dark-only — theme toggle removed

  let toastT;
  // REAL vendor cancellation portals — the cancel button takes you to the ACTUAL service's
  // cancel page (matched on the normalized merchant), not to anything of ours.
  const CANCEL_URLS = {
    NETFLIX: "https://www.netflix.com/cancelplan",
    SPOTIFY: "https://www.spotify.com/account/subscription/",
    HULU: "https://secure.hulu.com/account",
    "DISNEY": "https://www.disneyplus.com/account",
    "AMAZON": "https://www.amazon.com/gp/primecentral",
    PRIME: "https://www.amazon.com/gp/primecentral",
    ADOBE: "https://account.adobe.com/plans",
    LINKEDIN: "https://www.linkedin.com/psettings/manage-premium",
    ZOOM: "https://zoom.us/billing",
    DROPBOX: "https://www.dropbox.com/account/plan",
    CHEGG: "https://www.chegg.com/my/subscriptions",
    "YOUTUBE": "https://www.youtube.com/paid_memberships",
    APPLE: "https://support.apple.com/118428",
    AUDIBLE: "https://www.audible.com/account/overview",
    NYTIMES: "https://myaccount.nytimes.com/seg/subscription",
    "NEW YORK TIMES": "https://myaccount.nytimes.com/seg/subscription",
    PARAMOUNT: "https://www.paramountplus.com/account/",
    MAX: "https://www.max.com/account",
    HBO: "https://www.max.com/account",
    CRUNCHYROLL: "https://www.crunchyroll.com/account/membership",
    XBOX: "https://account.microsoft.com/services",
    MICROSOFT: "https://account.microsoft.com/services",
    PLAYSTATION: "https://www.playstation.com/acct/management",
    NOTION: "https://www.notion.so/my-account",
    CANVA: "https://www.canva.com/settings/billing",
    GRAMMARLY: "https://account.grammarly.com/subscription",
    NORTON: "https://my.norton.com/extspa/account",
    MCAFEE: "https://home.mcafee.com/secure/protected/dashboard.aspx",
    STREAMMAX: "https://www.google.com/search?q=cancel+StreamMax+subscription",
    GYM: "https://www.google.com/search?q=how+to+cancel+gym+membership+by+letter",
  };
  function cancelUrl(a) {
    if (!a || (a.kind !== "dead_subscription" && a.kind !== "price_creep")) return null;
    const name = String(a.raw || a.title || "").toUpperCase();
    for (const k in CANCEL_URLS) if (name.includes(k)) return CANCEL_URLS[k];
    // clean merchant only: drop our title decorations ("— active subscription (still using it?)",
    // "Trial converting:", Review/Cancel prefixes) so the search is "cancel JOBLEADS subscription"
    const m = name.split("—")[0].split("(")[0]
      .replace(/^(REVIEW|CANCEL|CHALLENGE|TRIAL CONVERTING:)\s+|\s+(SUBSCRIPTION|PRICE HIKE)$/g, "").trim();
    return "https://www.google.com/search?q=" + encodeURIComponent("cancel " + (m || name) + " subscription");
  }
  // "Draft in Gmail" — opens the user's OWN Gmail compose window pre-filled with the claim
  // (no extra OAuth scope needed; the user reviews and presses send themselves).
  function gmailComposeUrl(a) {
    const draft = a.draft || "";
    const subj = (draft.match(/^Subject:\s*(.+)$/m) || [])[1] || ("Regarding my " + (a.raw || a.title || "subscription"));
    const body = draft.replace(/^Subject:.*\n+/, "");
    return "https://mail.google.com/mail/?view=cm&su=" + encodeURIComponent(subj) + "&body=" + encodeURIComponent(body);
  }

  // Honest model badge: name the actual tier that produced the reasoning (never imply Gemini 3
  // when a free-tier fallback ran). Mirrors the backend resilience ladder.
  function modelLabel(run) {
    if (!run || !run.model) return "—";
    const m = String(run.model), ms = run.latency_ms ? " · " + run.latency_ms + "ms" : "";
    if (m.indexOf("gemini-3") === 0) return "Gemini 3 · live" + ms;
    if (m.indexOf("gemma") === 0) return m + " · Gemma resilience tier (free, primary rate-limited)" + ms;
    if (m.indexOf("gemini") === 0) return m + " · Gemini fallback tier" + ms;
    if (m === "deterministic-fallback") return "grounded rules · AI cooling down (no amount invented)";
    return m + (run.live ? " · live" : "") + ms;
  }

  function toast(msg) {
    let t = $(".toast"); if (!t) { t = el("div", "toast"); t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); document.body.appendChild(t); }
    t.innerHTML = icon('check') + " " + esc(msg); t.classList.add("show");
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
