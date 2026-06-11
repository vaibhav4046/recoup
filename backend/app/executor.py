"""Recoup — Playwright execution agent (the browser-automation layer).

On an approved cancellation, this agent drives a REAL headless Chromium to the vendor's own
cancellation portal and streams back screenshots — the live preview of the agent walking the
path. It is deliberately credential-free: it navigates public portal pages only, and where a
vendor requires the user's login, the screenshot shows that wall honestly — the final click
belongs to the human inside their own account.

SECURITY: navigation is restricted to an allowlist of known vendor cancellation domains.
Arbitrary URLs are refused (no SSRF, no surprise fetches). One execution at a time.
"""
from __future__ import annotations

import base64
import threading
import time
from urllib.parse import urlparse

ALLOWED_DOMAINS = {
    "netflix.com", "spotify.com", "hulu.com", "disneyplus.com", "amazon.com", "adobe.com",
    "linkedin.com", "zoom.us", "dropbox.com", "chegg.com", "youtube.com", "apple.com",
    "audible.com", "nytimes.com", "paramountplus.com", "max.com", "crunchyroll.com",
    "microsoft.com", "playstation.com", "notion.so", "canva.com", "grammarly.com",
    "norton.com", "mcafee.com", "google.com",
}

_lock = threading.Lock()  # one browser at a time — Cloud Run memory discipline


def _allowed(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
        return any(host == d or host.endswith("." + d) for d in ALLOWED_DOMAINS)
    except Exception:
        return False


def run_preview(url: str) -> dict:
    """Drive headless Chromium to the vendor portal; return step log + screenshots (base64 JPEG)."""
    if not _allowed(url):
        return {"ok": False, "error": "domain not in the vendor allowlist", "steps": [], "shots": []}
    if not _lock.acquire(timeout=2):
        return {"ok": False, "error": "executor busy — try again in a moment", "steps": [], "shots": []}
    t0 = time.perf_counter()
    steps, shots = [], []
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
            try:
                page = browser.new_page(viewport={"width": 1280, "height": 800})
                steps.append({"t": "Headless Chromium launched (Playwright)", "ms": round((time.perf_counter() - t0) * 1000)})
                page.goto(url, wait_until="domcontentloaded", timeout=20000)
                steps.append({"t": f"Navigated to {urlparse(url).hostname}", "ms": round((time.perf_counter() - t0) * 1000)})
                page.wait_for_timeout(2500)  # let the portal settle/redirect (often to the vendor's login wall)
                shot = page.screenshot(type="jpeg", quality=60)
                shots.append(base64.b64encode(shot).decode())
                title = (page.title() or "")[:120]
                final_host = (urlparse(page.url).hostname or "")
                login_wall = any(w in page.url.lower() or w in title.lower()
                                 for w in ("login", "signin", "sign-in", "auth", "checkpoint"))
                steps.append({"t": f"Portal reached: \"{title}\"" + (" — vendor login wall (your account, your final click)" if login_wall else ""),
                              "ms": round((time.perf_counter() - t0) * 1000)})
                return {"ok": True, "steps": steps, "shots": shots, "final_url_host": final_host,
                        "login_wall": login_wall, "total_ms": round((time.perf_counter() - t0) * 1000)}
            finally:
                browser.close()
    except Exception as e:  # noqa: BLE001
        steps.append({"t": f"Execution stopped: {type(e).__name__}", "ms": round((time.perf_counter() - t0) * 1000)})
        return {"ok": False, "error": type(e).__name__, "steps": steps, "shots": shots}
    finally:
        _lock.release()
