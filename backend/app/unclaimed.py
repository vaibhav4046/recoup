"""Recoup — REAL owed-money discovery: search official unclaimed-property records by name.

The `unclaimed_records` Atlas collection holds an indexed slice of the California State
Controller's public unclaimed-property dataset ($500-and-up segment, updated weekly at
sco.ca.gov/upd_download_property_records.html). Every record is real: the same owner name
searched at claimit.ca.gov returns the same property. This is the product's genuinely-real
"money you're OWED" path — discovery against actual government data, not a fixture.

Honesty contract: results carry the slice size + source, amounts come from the record (never
the model), and the claim always happens on the official state site.
"""
from __future__ import annotations

import re

from .config import get_settings

CLAIM_URL = "https://claimit.ca.gov"
SOURCE_PAGE = "https://sco.ca.gov/upd_download_property_records.html"


def _coll():
    from . import mongodb
    return mongodb.db()["unclaimed_records"]


def available() -> bool:
    return get_settings().mongodb_ready


def stats() -> dict:
    try:
        return {"records": _coll().estimated_document_count(), "segment": "$500 and up (CA)",
                "source": SOURCE_PAGE}
    except Exception:
        return {"records": 0}


_stats_cache: dict = {}


def stats_full() -> dict:
    """REAL aggregate over the indexed slice of official CA records: total $ sitting unclaimed,
    record count, and the largest single records. Cached in-process (the slice changes only on
    re-seed) so the landing page can show it without an aggregation per pageview."""
    global _stats_cache
    if _stats_cache:
        return _stats_cache
    try:
        coll = _coll()
        agg = list(coll.aggregate([{"$group": {"_id": None, "total": {"$sum": "$amount"},
                                               "n": {"$sum": 1}, "max": {"$max": "$amount"}}}]))
        top = list(coll.find({}, {"_id": 0, "owner_name": 1, "owner_city": 1, "amount": 1, "holder": 1})
                   .sort("amount", -1).limit(3))
        a = agg[0] if agg else {}
        _stats_cache = {"ok": True, "records": a.get("n", 0), "total_amount": round(a.get("total", 0.0), 2),
                        "largest": round(a.get("max", 0.0), 2), "top": top,
                        "segment": "$500 and up (CA)", "source": SOURCE_PAGE}
        return _stats_cache
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": type(e).__name__, "records": 0, "total_amount": 0}


def search(name: str, limit: int = 10) -> dict:
    """Anchored-prefix match on the normalized owner name (CA records are 'LAST FIRST M').
    Searching 'Garcia' or 'Garcia Maria' both work. Returns top hits by amount."""
    q = re.sub(r"[^A-Z ]", "", (name or "").upper()).strip()
    if len(q) < 3:
        return {"ok": False, "error": "enter at least 3 letters of a last name", "results": []}
    try:
        pattern = "^" + re.escape(q)  # anchored prefix -> uses the owner_name index
        cur = (_coll().find({"owner_name": {"$regex": pattern}},
                            {"_id": 0, "property_id": 1, "property_type": 1, "owner_name": 1,
                             "owner_city": 1, "owner_state": 1, "amount": 1, "holder": 1,
                             "securities": 1})
               .sort("amount", -1).limit(max(1, min(limit, 25))))
        results = list(cur)
        total = _coll().count_documents({"owner_name": {"$regex": pattern}})
        return {"ok": True, "query": q, "results": results, "total_matches": total,
                "claim_url": CLAIM_URL, **stats()}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"{type(e).__name__}", "results": []}
