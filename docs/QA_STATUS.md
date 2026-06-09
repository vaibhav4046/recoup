# Recoup — QA / defect status (flawlessness pass)

Generated from a 60-agent defect hunt (78 reported → 40 confirmed real after adversarial verify) + a hard break-test. **40 of 40 fixed in code. Frontend fixes are deployed and live-verified; backend auth hardening is code-complete and tested locally, pending HF deploy because `HF_TOKEN` is not available in this workspace.** Live build: https://recoup-vaibhav4046s-projects.vercel.app

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
