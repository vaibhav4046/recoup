/* Recoup — parser acceptance tests. Zero deps: `node tests/recover.test.mjs`.
   Loads the real browser engine (recover.js) under a window shim and asserts the
   hackathon acceptance criteria (gateway split, annualization, scatter rejection,
   duplicate = one-time, empty input). */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(join(dir, "..", "recover.js"), "utf8");
const win = {};
// eslint-disable-next-line no-new-func
new Function("window", code)(win);
const { scan, SAMPLE } = win.RecoupScan;

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log("  PASS " + name); } else { fail++; console.log("  FAIL " + name); } };
const find = (r, pred) => r.findings.find(pred);

// 1) gateway split: PAYPAL *NYTIMES and PAYPAL *SPOTIFY must NOT merge
{
  const r = scan("PAYPAL *NYTIMES 12.00\nPAYPAL *SPOTIFY 11.99");
  const names = r.findings.map((f) => f.title.toUpperCase()).join(" | ");
  ok("PAYPAL *NYTIMES and PAYPAL *SPOTIFY stay distinct", /NYTIMES/.test(names) && /SPOTIFY/.test(names) && r.findings.length >= 2);
}

// 2) recurring gym annualized correctly (monthly * 12)
{
  const r = scan(["2026-01-15, PLANETFIT GYM, 49.99", "2026-02-15, PLANETFIT GYM, 49.99", "2026-03-15, PLANETFIT GYM, 49.99"].join("\n"));
  const gym = find(r, (f) => f.kind === "dead_subscription" && /PLANETFIT/i.test(f.title));
  ok("recurring gym annualized to ~$599.88/yr", !!gym && Math.abs(gym.amount - 599.88) < 0.05 && gym.cadence === "yearly");
}

// 3) modest consistent rise = price hike
{
  const r = scan(["2026-01-03, NETFLIX, 15.49", "2026-02-03, NETFLIX, 15.49", "2026-03-03, NETFLIX, 17.99"].join("\n"));
  ok("modest price rise flagged as price_creep", !!find(r, (f) => f.kind === "price_creep"));
}

// 4) wild scatter at one merchant is NOT a subscription (variable spend)
{
  const r = scan(["2026-01-02, AMAZON, 5.00", "2026-01-19, AMAZON, 200.00"].join("\n"));
  ok("wild-scatter merchant (Amazon) is not flagged", !find(r, (f) => /AMAZON/i.test(f.title)));
}

// 5) duplicate within 3 days = one-time billing error, NOT annualized
{
  const r = scan(["2026-01-01, ACMESAAS, 49.00", "2026-01-02, ACMESAAS, 49.00"].join("\n"));
  const dup = find(r, (f) => f.kind === "billing_error");
  ok("duplicate charge flagged as one-time (not annualized)", !!dup && dup.cadence === "once" && Math.abs(dup.amount - 49) < 0.01);
}

// 6) empty / noise input yields no findings (no false positives)
{
  const r = scan("");
  ok("empty input returns zero findings", r.findings.length === 0);
  const r2 = scan("RENT 1200.00\nSALARY 3000.00\nTRANSFER 500.00");
  ok("single one-off lines with dates absent are handled without crashing", Array.isArray(r2.findings));
}

// 7) bundled sample scans and produces findings + a transaction count
{
  const r = scan(SAMPLE);
  ok("bundled SAMPLE yields findings + txn count", r.findings.length >= 3 && r.txns > 0);
}

// 9) REAL bank CSV: Chase export — purchases NEGATIVE, quoted desc with comma, payment row skipped
{
  const chase = ["Transaction Date,Post Date,Description,Category,Type,Amount",
    "01/05/2026,01/06/2026,NETFLIX.COM,Entertainment,Sale,-15.49",
    "02/05/2026,02/06/2026,NETFLIX.COM,Entertainment,Sale,-15.49",
    '02/07/2026,02/08/2026,"AMAZON MKTPL, INC",Shopping,Sale,-42.10',
    "02/10/2026,02/11/2026,Payment Thank You,Payment,Payment,200.00"].join("\n");
  const r = scan(chase);
  ok("Chase CSV: negative purchases parsed, payment excluded", r.txns === 3 && !!find(r, (f) => /NETFLIX/i.test(f.title)));
}

// 10) REAL bank CSV: Wells Fargo (all-quoted, Date,Amount,*,*,Description) + Amex (positive charges)
{
  const wells = ['Date,Amount,*,*,Description', '"01/03/2026","-9.99","*","","SPOTIFY USA"',
    '"02/03/2026","-9.99","*","","SPOTIFY USA"', '"02/05/2026","1500.00","*","","DIRECT DEPOSIT PAYROLL"'].join("\n");
  const w = scan(wells);
  ok("Wells Fargo CSV: deposit excluded, Spotify found", !!find(w, (f) => /SPOTIFY/i.test(f.title)) && !find(w, (f) => /PAYROLL/i.test(f.title)));
  const amex = ["Date,Description,Amount", "01/15/2026,HULU LLC,17.99", "02/15/2026,HULU LLC,17.99",
    "02/16/2026,AMEX EPAYMENT ACH PYMT,-300.00"].join("\n");
  const a = scan(amex);
  ok("Amex CSV: positive charges parsed, ACH payment excluded", !!find(a, (f) => /HULU/i.test(f.title)) && !find(a, (f) => /EPAYMENT/i.test(f.title)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
