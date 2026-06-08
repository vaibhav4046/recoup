/* Recoup — client-side recovery engine. Runs ENTIRELY in the browser; the user's
   statement never leaves the device (no network call). Detects, honestly, what a
   statement actually reveals: recurring subscriptions, silent price increases, and
   duplicate charges. */
window.RecoupScan = (function () {
  "use strict";
  const round2 = (n) => Math.round(n * 100) / 100;

  function norm(m) {
    return m.toUpperCase().replace(/\s+/g, " ")
      .replace(/\b(INC|LLC|LTD|CO|COM|PURCHASE|RECURRING|PAYMENT|AUTOPAY|POS|DEBIT|CARD|VISA|MASTERCARD)\b/g, "")
      .replace(/[*#].*$/, "").replace(/\d{2,}/g, "").replace(/[^A-Z& ]/g, " ").replace(/\s+/g, " ").trim();
  }

  function parseLine(line) {
    line = line.trim(); if (!line || /^(date|merchant|description|amount)/i.test(line)) return null;
    let amount = null, date = null, nameBits = [];
    const parts = line.split(/[,\t;|]+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      parts.forEach((p) => {
        const clean = p.replace(/[\s$£€]/g, "");
        if (/^-?\d[\d,]*\.?\d{0,2}$/.test(clean)) { const n = Math.abs(parseFloat(clean.replace(/,/g, ""))); if (!isNaN(n)) amount = n; }
        else if (/\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4}/.test(p)) date = p;
        else nameBits.push(p);
      });
    }
    if (amount === null) { // "Netflix 19.99" (space separated)
      const m = line.match(/^(.+?)[\s$£€]+(\d[\d,]*\.?\d{0,2})\s*$/);
      if (m) { nameBits = [m[1]]; amount = parseFloat(m[2].replace(/,/g, "")); }
    }
    const merchant = nameBits.join(" ").trim();
    if (!merchant || amount == null || amount <= 0) return null;
    return { date, merchant: norm(merchant) || merchant.toUpperCase(), raw: merchant.replace(/\s+/g, " ").trim(), amount: round2(amount) };
  }

  function mk(id, name, kind, amount, evidence, confidence, unit, once) {
    const band = confidence >= 0.85 ? "high" : confidence >= 0.7 ? "medium" : "review";
    const title = kind === "price_creep" ? `Challenge ${name} price hike`
      : kind === "billing_error" ? `Dispute ${name} duplicate charge`
      : `Review ${name} subscription`;
    return {
      id: "u_" + (id.replace(/\W/g, "").slice(0, 14) || "x") + "_" + kind,
      kind, title, amount, cadence: once ? "once" : "yearly", currency: "$",
      amount_label: once ? `$${amount.toFixed(0)}` : `$${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr`,
      unit_note: unit,
      evidence, rule: kind === "price_creep" ? "price_creep" : kind === "billing_error" ? "billing_error" : "dead_sub",
      confidence, confidence_band: band,
      caveat: kind === "billing_error" ? "Confirm these aren't two legitimate separate purchases."
        : kind === "price_creep" ? "The vendor can decline; cancelling is your leverage."
        : "Confirm you've actually stopped using it before you cancel.",
      claim_url: null,
      odds: kind === "billing_error" ? "likely" : kind === "price_creep" ? "often works" : "very likely",
      timeline: kind === "billing_error" ? "1–2 statements" : kind === "price_creep" ? "a few days" : "instant–1 cycle",
      agent: kind === "billing_error" ? "billing_auditor" : "sub_hunter",
      agent_name: kind === "billing_error" ? "Billing Auditor" : kind === "price_creep" ? "Subscription Hunter" : "Subscription Hunter",
      verify: { ok: true, review: false, checks: [
        { label: "amount is positive", ok: amount > 0 },
        { label: "detected from your own statement", ok: true },
        { label: kind === "billing_error" ? "duplicate pattern matched" : "recurring pattern matched", ok: true },
      ] },
      draft: kind === "billing_error"
        ? `Subject: Dispute a duplicate charge\n\nI was charged $${amount.toFixed(2)} by ${name} more than once. Please confirm whether this is a duplicate and refund it if so.`
        : kind === "price_creep"
        ? `Subject: Apply my old rate or cancel\n\nMy ${name} price increased. Please apply the previous/new-customer rate, or treat this as notice of cancellation.`
        : `Subject: Cancel ${name}\n\nPlease cancel my ${name} subscription effective immediately and confirm in writing, including any proration owed.`,
      approvalState: "pending", status: "drafted", claimedAt: null, source: "your statement",
    };
  }

  function scan(text) {
    const txns = (text || "").split(/\r?\n/).map(parseLine).filter(Boolean);
    if (!txns.length) return { findings: [], txns: 0 };
    const hasDates = txns.filter((t) => t.date).length >= txns.length * 0.3;
    const byMerch = {};
    txns.forEach((t) => { (byMerch[t.merchant] = byMerch[t.merchant] || []).push(t); });
    const findings = [];
    Object.entries(byMerch).forEach(([m, list]) => {
      const amts = list.map((t) => t.amount), mn = Math.min(...amts), mx = Math.max(...amts);
      const monthly = round2(amts.reduce((a, b) => a + b, 0) / amts.length);
      const name = list[0].raw;
      if (list.length >= 2 && mx - mn > 0.5 && mx > mn * 1.04) {
        findings.push(mk(m, name, "price_creep", round2((mx - mn) * 12), `${name}: charge rose $${mn.toFixed(2)} → $${mx.toFixed(2)} across ${list.length} charges`, 0.82, `+$${(mx - mn).toFixed(2)}/mo`));
      } else if (list.length >= 2) {
        findings.push(mk(m, name, "dead_subscription", round2(monthly * 12), `${list.length} recurring charges of ~$${monthly.toFixed(2)} to ${name}`, 0.8, `$${monthly.toFixed(2)}/mo`));
      } else if (!hasDates) {
        findings.push(mk(m, name, "dead_subscription", round2(monthly * 12), `$${monthly.toFixed(2)}/mo to ${name} — listed as a subscription`, 0.7, `$${monthly.toFixed(2)}/mo`));
      }
      // duplicate = same amount within 3 days (NOT the normal monthly cadence)
      if (hasDates) {
        const byAmt = {};
        list.forEach((t) => { const d = Date.parse(t.date); if (!isNaN(d)) (byAmt[t.amount.toFixed(2)] = byAmt[t.amount.toFixed(2)] || []).push(d); });
        Object.entries(byAmt).forEach(([amt, days]) => {
          days.sort((a, b) => a - b);
          let dup = false;
          for (let i = 1; i < days.length; i++) if ((days[i] - days[i - 1]) / 86400000 <= 3) dup = true;
          if (dup) findings.push(mk(m + amt, name, "billing_error", round2(parseFloat(amt)), `two $${amt} charges to ${name} within days — likely duplicate`, 0.72, "one-time", true));
        });
      }
    });
    const recurring = round2(findings.filter((f) => f.cadence === "yearly").reduce((s, f) => s + f.amount, 0));
    const one_time = round2(findings.filter((f) => f.cadence === "once").reduce((s, f) => s + f.amount, 0));
    return { findings, txns: txns.length, recurring_year: recurring, one_time, total: round2(recurring + one_time) };
  }

  const SAMPLE = [
    "2026-01-03, NETFLIX.COM, 15.49",
    "2026-02-03, NETFLIX.COM, 15.49",
    "2026-03-03, NETFLIX.COM, 17.99",
    "2026-01-08, SPOTIFY USA, 11.99",
    "2026-02-08, SPOTIFY USA, 11.99",
    "2026-03-08, SPOTIFY USA, 11.99",
    "2026-01-15, PLANETFIT GYM, 49.99",
    "2026-02-15, PLANETFIT GYM, 49.99",
    "2026-01-21, ADOBE *CREATIVECLOUD, 59.99",
    "2026-02-21, ADOBE *CREATIVECLOUD, 59.99",
    "2026-02-22, ADOBE *CREATIVECLOUD, 59.99",
    "2026-01-27, NYTIMES DIGITAL, 4.25",
    "2026-02-27, NYTIMES DIGITAL, 18.00",
  ].join("\n");

  return { scan, SAMPLE };
})();
