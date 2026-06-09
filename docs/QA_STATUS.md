# Recoup — QA / defect status (flawlessness pass)

Generated from a 60-agent defect hunt (78 reported → 40 confirmed real) + a hard break-test. **40 of 40 fixed in code AND DEPLOYED. Frontend + backend both live and verified.** Live build: https://recoup-vaibhav4046s-projects.vercel.app

## ✅ Backend deployed + live-verified — 2026-06-09 (morning)
The one pending blocker from the overnight pass (backend redeploy, which that session couldn't do without `HF_TOKEN`) is **DONE**. Redeployed the HF Space and verified live:
- **`/mcp` is LIVE** (was 404) — JSON-RPC server with **4 working tools**, all execute correctly: `recoup_scan_demo` ("Found 10 recoverable actions: $756/yr + $1,555 one-time"), `recoup_get_state`, `gmail_detect_subscriptions`, `gmail_connection_status` (honest read-only disclosure). Unknown-tool returns the correct `-32601` (B6 fix verified).
- **SHA-256 audit chain exposed + intact in `/api/health`:** `audit: {intact: true, count: 2, head: 9de2aa2…}` — judges can verify the chain.
- **B1–B8 auth/security hardening shipped** (magic-link localhost-only, CAPTCHA fail-closed, Gmail annual/thousands parse fixes, refund-skip, MCP error codes, forget no-op for anon, logout cookie match).
- Gemini live · MongoDB live · gemini-2.5-flash. `/api/auth/status` google:true, no secrets leaked.
- **Frontend live re-verified against the fresh backend** (Chrome): product-led hero renders, 0 console errors, 10 cards, all chips live (incl. Backend·live), per-visitor clean state ("≈$2,311 recoverable"), no shared "$250" residue.

## Live QA + hardening pass — 2026-06-09 (autonomous overnight)

Full hands-on live QA of the deployed product (Vercel frontend + HF backend) via Chrome + a 5-viewport Playwright harness, plus a 4-agent static code/security/a11y/docs review swarm and a 16-persona adversarial panel. Verified live → fixed → re-deployed (frontend) → re-verified live.

### Verified GREEN on the live site
- **Zero console / page errors** across 375 / 390 / 430 / 1280 / 1440 px (Playwright) and through every interactive flow (Chrome).
- **No horizontal overflow** at any mobile width; the mobile hero is product-led and thumb-friendly.
- **Full lifecycle** drafted → approved → sent → recovered works; ring + counters + audit update; shows "$240 recovered (you confirmed)".
- **Audit hash-chain**: SHA-256 chained, genesis from a per-visitor reset (no cross-visitor leakage); 3 chained events verified after a lifecycle.
- **XSS-safe paste**: hostile merchant names (`<img onerror>`, `<svg onload>`, `<script>`) render as inert escaped text — 0 injected nodes, 0 markers fired.
- **Empty / hostile scan input** handled gracefully (toast, no crash). **Esc** closes dialogs; closed dialogs are `aria-hidden`.
- **Light + dark** both render correctly (light mode was previously broken — now clean). **Delete my data** clears local + server findings.
- **Demo walkthrough** completes the full loop (€250 EU261) with currency-correct "€250 recovered", 0 errors.
- **/api/health** live (gemini:live · mongodb:live · gemini-2.5-flash); **/api/auth/status** google:true, no secrets leaked.

### Fixed this pass — deployed to Vercel + live-verified (commit 2613260)
| # | Sev | Issue | Fix |
|---|---|---|---|
| L1 | P0 | README/SUBMISSION claimed the MCP surface is live, but `/mcp` 404s on the Space | Reworded to "committed; live after backend redeploy" + a Live-status note |
| L2 | P2 | Skip link targeted `#results` (display:none on first paint) — dead on the landing | Repointed to always-present `#main` (tabindex −1) |
| L3 | P2 | Background stayed in the AT tree while a dialog was open (only a JS focus-trap guarded it) | `#main`/`.topbar`/`#bg-field` go `inert`+`aria-hidden` while a dialog is open |
| L4 | P2 | Small muted/dim text below WCAG AA 4.5:1 (dark theme) | Lifted `--muted`/`--dim` |
| L5 | P1 | Finding `id` interpolated unescaped into card HTML/data-attrs | `esc()` the id (defense-in-depth) |
| L6 | P2 | recover.js mis-split thousands separators ("$1,200" → 200 / 1.20) | Protect thousands commas before the delimiter split; unit-tested |
| L7 | P3 | Theme toggle had no state in its accessible name | `aria-pressed` reflects light/dark |

### Fixed in code, NOT yet deployed — backend (commit 0d9d122; goes live on redeploy)
| # | Sev | Issue | Fix |
|---|---|---|---|
| B1 | P1 | Magic-link returned a working sign-in link (`dev_link`) from the public backend | `dev_link` only on a localhost backend (`Settings.is_local`) |
| B2 | P1 | CAPTCHA failed OPEN when Turnstile unconfigured | fails CLOSED in prod |
| B3 | P1 | Gmail annualized annual receipts ×12 ($155.88/yr → $1,871/yr) | detect billing period; annual receipts are not re-annualized (unit-tested → 155.88) |
| B4 | P1 | Gmail money regex corrupted thousands ("$1,200" → 1.20) | thousands-aware parse (unit-tested → 1200) |
| B5 | P2 | Gmail surfaced refund-already-issued emails as live leaks | skip refund/credit/cancellation-confirmation emails (unit-tested → 0) |
| B6 | P2 | MCP mis-coded bad input / unknown tool as −32603 with a raw exception string | −32601 / −32602 + input validation + generic −32603 catch-all (verified) |
| B7 | P2 | `/api/account/forget` could wipe ALL visitors' findings for an anonymous caller | no-identity → no-op |
| B8 | P2 | logout `delete_cookie` attributes didn't match the set-cookie | match path/secure/samesite/httponly |

Backend validated locally: `compileall`, `auth_smoke`, `mcp_smoke`, and a gmail-fix unit test — all green.

### Known limitations (honest)
- ✅ DONE (2026-06-09 morning): backend redeployed — `/mcp` is live (4 tools, verified), the audit chain is in `/api/health` (intact:true), and B1–B8 shipped. (Owner should still rotate the HF token afterward.)
- `snapshot.py`'s `one_time`/`total` still sum a €250 EU261 figure with USD; the frontend already labels this "≈$ mixed-currency", so the deeper per-currency split was deferred to avoid breaking the live frontend's number animation unverified — tracked for the owner.
- No verified real recovery yet → `wouldUse` is realistically capped; the recovery ledger is honest-empty.
- Google OAuth is published but unverified → judges see an "unverified app" warning + ~100 test-user cap. The paste path needs no sign-in.

### 16-persona adversarial panel (honest, internal)
Averages: clarity 7.4 · trust 6.9 · **wouldUse 4.3** · demoWow 6.4 · riskConcern 4.2 (lower = better). Panel win-readiness: **6/10**.

Deployable fixes folded in (commit `08e6a50`, **live + verified**):
- Paste scan foregrounded as the primary path; Gmail demoted behind an "advanced · testers only" `<details>` with an explicit unverified-app warning (the #1 recurring blocker, raised by 8).
- login.html a11y (visible email label, skip-link, `<main>`, real logo) + OAuth pre-warning naming the read-only scope and the unverified-app step (raised by 4).
- privacy.html: effective date, named data controller + contact, prominent anti-scam promise, Google API Limited-Use affirmation, processors/transfer disclosure (raised by 3).
- Security headers (CSP `frame-ancestors 'none'`, X-Frame-Options DENY, nosniff, Referrer-Policy) — verified live in the response headers.
- Honesty: landing "$1,719" relabeled an illustrative preview; count-up lands on the exact value even when rAF is paused (hidden tab) or `prefers-reduced-motion` is set.

Owner-gated (cannot be fixed in code): **one verified real recovery** (raised by 8 — the single biggest lever); a backend **redeploy** to make `/mcp` live, expose the SHA-256 chain tip in `/api/health`, and ship B1–B8.

Live verification: 2026-06-09 (UTC). Frontend commits `2613260` + `08e6a50` (live on Vercel). Backend commits `0d9d122` + audit-in-health (committed, awaiting owner redeploy).

---

## Headline wins
- 🎉 **Live Gemini reasoning now renders on the deployed backend** (`live: true · gemini-2.5-flash`) — it fell back all session until the defensive-parse fix.
- **Light mode rebuilt** — was genuinely broken in ~10 spots (invisible ring track, breakdown bars, borders; illegible buttons/amounts).
- **Break-test: ZERO JS errors** under rapid approve-spam, garbage scan input, empty scan, demo-vs-manual click races, theme toggling, bad form input.

## Fixed (27)
**Visual / light-mode (13):** light overrides for ring-bg, bd-bar, au-system pill, demo-flag, fc-conf.review, fc-onetime amount, vrec green, copy/mail/approve buttons; the `var(--line)` undefined-variable regression; the missing global `.divider` style; `--dim` contrast (WCAG 1.4.3).
**Accessibility (6):** ring live-region (BLOCKER — status was silent to screen readers); Esc-to-close + focus-return for modal/drawer; heading outline (h1→h2→h3 via sr-only); 40px close-button + 24px link tap targets; skip-link; `.sr-only` utility.
**Robustness / security (5):** cold-start content-type guard (no HTML-as-data); XSS URL-scheme allowlist on claim hrefs; Gemini defensive parse (200-with-no-parts → labelled, not crash); httpx timeout classification; sha256 non-secure-context fallback.
**Functional / honesty (3):** loadGmail stale-total fix; card entry-animation no longer re-fires on lifecycle re-render; privacy-page storage claim + README roadmap matched to actual code.

## Also fixed since (batch 6–7)
Non-lossy findings aria-label (#29); decorative-glyph hiding on cards + provenance checks (#11, card content); Tab focus-trap in modal/drawer (#7). Dialog a11y is now complete: Esc-close + focus-return + focus-trap + rich labels.

## Fixed in batch 8
**Frontend, deployed + live-verified:** #11 button glyphs hidden from accessible names for approve/copy/email/claim-form/recovered controls; #30 `aria-describedby` added to scan modal and drawer; closed dialogs now start and return to `aria-hidden="true"` so they are absent from the accessibility snapshot until opened; #5 mixed-currency one-time totals now label the fallback EU261 mix as `≈$` with a mixed-currency note and per-category currency labels; #24 demo walkthrough now locks manual lifecycle actions and always releases the lock in `finally`; the dark drawer/textarea scrollbars now match the UI instead of showing Windows default white.

**Backend, code-complete + locally tested:** #20 one-time OAuth CSRF `state` validation for normal Google sign-in and Gmail OAuth; #21 HMAC session signing fails closed without `APP_SECRET`; #36 Gmail handoff redirects via URL fragment with a five-minute one-time token and POST lookup, with frontend compatibility fallback for the old GET endpoint while the Space awaits rebuild; #19 auth comments now match the intentionally-open public demo.

## Fixed in current pass
**Premium redesign:** replaced the centered landing card/orb treatment with a product-led first screen: sharper headline, trust proof chips, a live-looking Recoup product preview, direct "Run my scan" and "Show work" paths, and tighter responsive rules so the preview appears in the first mobile viewport without horizontal overflow.

**Hackathon tech story:** added a tested MCP-compatible JSON-RPC backend surface with `initialize`, `tools/list`, `tools/call`, `recoup_scan_demo`, `recoup_get_state`, `gmail_detect_subscriptions`, and `gmail_connection_status`. The Gmail detector accepts message metadata, calls the existing Gmail rule logic, and never exposes OAuth tokens through MCP.

**Data honesty/privacy polish:** the user recovery ledger now supports $, £, and € entries and totals by currency instead of forcing everything into pounds; Gmail-derived MCP findings preserve receipt currency; "Delete my data" now clears the browser recovery ledger immediately; paid cards use the real `.paid` state for the intended recovered styling.

## Remaining deployment gap
Backend deploy was not run because no `HF_TOKEN` is available in the environment or `backend/.env`. Run `HF_TOKEN=<token> python backend/scripts/deploy_hf.py` after rotating the exposed token, then verify `/api/auth/google/start`, `/api/gmail/start`, `/api/gmail/findings`, and `/mcp`.

## YOUR manual items (only you can do these)
- 🔓 **Make the GitHub repo PUBLIC** — the "See the code" link 404s until then, and private = hackathon DQ.
- 🔑 **Rotate the 2 exposed secrets** — HF token + Google OAuth client secret (both hit the chat).
- 👥 **Add test-user emails** in Google Cloud (Audience → Test users) for anyone who'll demo Gmail-connect (else "Access blocked / 403").
- 🎥 **Record the demo video** (`docs/VIDEO_SCRIPT.md`) + do the one real recovery to log in the recovery log.

## Honest note
This is the verified-clean state for the code paths that can be exercised without owner-owned secret rotation. The known remaining risk is external deployment/OAuth verification after the exposed secrets are rotated.
