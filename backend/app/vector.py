"""Recoup — MongoDB Atlas Vector Search: the agent's retrieval brain.

Consumer-protection precedents are embedded with Gemini text-embedding-004 (free) and
stored in Atlas with a native Vector Search index. For every finding the agent embeds the
case and runs an Atlas `$vectorSearch` aggregation to retrieve the most semantically
relevant legal basis — so each recovery is GROUNDED IN REAL PRECEDENT, not the model's
imagination. Zero cost (Gemini free tier + Atlas M0). If the Atlas vector index isn't
provisioned yet, it transparently falls back to in-process cosine over the same stored
Gemini embeddings, so retrieval never breaks during a demo.
"""
from __future__ import annotations

import math

from .config import get_settings

EMBED_MODEL = "gemini-embedding-001"
DIM = 768
INDEX = "recoup_vector_index"
COLL = "precedents"

# The agent's knowledge base — real consumer-protection precedents, one per recovery type.
PRECEDENTS = [
    {"id": "eu261", "kind": "flight_comp", "title": "EU261 / UK261 flight-delay compensation",
     "jurisdiction": "EU/UK", "basis": "Regulation (EC) 261/2004; UK261",
     "text": "Air passengers delayed three or more hours, or denied boarding, are owed FIXED CASH compensation of EUR250 to EUR600 by flight distance — not vouchers. The airline must pay unless it proves extraordinary circumstances. This is a one-time payout and is never recurring."},
    {"id": "price_creep", "kind": "price_creep", "title": "Silent subscription price increase",
     "jurisdiction": "US/UK/EU", "basis": "FTC Negative Option Rule; UK Consumer Rights Act 2015; EU UCPD",
     "text": "A vendor must give clear advance notice before raising the price of a recurring subscription. The customer can demand the prior or new-customer retention rate, or cancel with proration. The recoverable value is the annualized price delta."},
    {"id": "billing_error", "kind": "billing_error", "title": "Duplicate or erroneous charge dispute",
     "jurisdiction": "US", "basis": "Fair Credit Billing Act, 15 U.S.C. 1666; Regulation Z",
     "text": "A cardholder may dispute a billing error such as a duplicate charge or an incorrect amount within 60 days of the statement. The issuer must investigate and credit confirmed errors, and chargeback rights apply."},
    {"id": "dead_subscription", "kind": "dead_subscription", "title": "Unused recurring subscription",
     "jurisdiction": "US/UK/EU", "basis": "FTC Click-to-Cancel Rule; UK CRA 2015 auto-renewal terms",
     "text": "Consumers have the right to cancel a recurring subscription as easily as they signed up. Charges for an unused service can be cancelled prospectively, and any pre-paid unused period should be prorated and refunded."},
    {"id": "refund_window", "kind": "price_drop", "title": "Price-protection / refund-window claim",
     "jurisdiction": "US/UK", "basis": "Merchant price-protection policies; UK CRA short-term right to reject",
     "text": "Many merchants refund the difference if an item's price drops within a stated window, or accept returns within 14-30 days. The recoverable amount is the one-time price difference, not an annual figure."},
    {"id": "settlement", "kind": "settlement", "title": "Class-action settlement claim",
     "jurisdiction": "US", "basis": "Federal Rule of Civil Procedure 23; settlement administrators",
     "text": "When a company settles a class action, affected consumers can file a one-time claim for their share, often with no proof of purchase required up to a cap. Deadlines apply; the payout is one-time."},
    {"id": "unclaimed", "kind": "unclaimed", "title": "Unclaimed property recovery",
     "jurisdiction": "US/UK", "basis": "State unclaimed-property laws; UK dormant assets scheme",
     "text": "Forgotten deposits, refunds, insurance payouts and account balances are escheated to the state and held in the owner's name. They can be reclaimed for free directly from the official state or government portal as a one-time recovery."},
    {"id": "warranty", "kind": "warranty", "title": "Warranty / covered-repair claim",
     "jurisdiction": "US/UK/EU", "basis": "Magnuson-Moss Warranty Act; EU 2-year legal guarantee",
     "text": "Goods carry a manufacturer or statutory guarantee. A covered defect must be repaired or replaced at no cost; in the EU consumers have a two-year legal guarantee regardless of any paid warranty. Value is one-time."},
    {"id": "deposit", "kind": "deposit", "title": "Overdue security-deposit return",
     "jurisdiction": "US/UK", "basis": "State landlord-tenant statutes; UK Tenancy Deposit Scheme",
     "text": "A landlord must return a security deposit within a statutory window (often 14-30 days) minus itemized lawful deductions. Late or wrongful retention can trigger statutory penalties of up to three times the deposit."},
]


def _embed(text: str, task: str = "RETRIEVAL_DOCUMENT") -> list[float]:
    import httpx
    s = get_settings()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{EMBED_MODEL}:embedContent"
    body = {"model": f"models/{EMBED_MODEL}", "content": {"parts": [{"text": text[:2000]}]}, "taskType": task, "outputDimensionality": DIM}
    r = httpx.post(url, params={"key": s.google_api_key}, json=body, timeout=20)
    r.raise_for_status()
    return r.json()["embedding"]["values"]


def _coll():
    from pymongo import MongoClient
    s = get_settings()
    return MongoClient(s.mongodb_uri)[s.mongodb_db][COLL]


def _ensure_index(coll) -> bool:
    """Create the Atlas Vector Search index if it's missing (M0+ supports it)."""
    try:
        names = [i.get("name") for i in coll.list_search_indexes()]
        if INDEX in names:
            return True
        from pymongo.operations import SearchIndexModel
        coll.create_search_index(SearchIndexModel(
            definition={"fields": [{"type": "vector", "path": "embedding", "numDimensions": DIM, "similarity": "cosine"}]},
            name=INDEX, type="vectorSearch"))
        return True
    except Exception:
        return False  # index build pending / unsupported -> cosine fallback still works


def seed() -> dict:
    """Embed + upsert the precedent corpus and ensure the vector index. Idempotent."""
    s = get_settings()
    if not (s.mongodb_ready and s.gemini_ready):
        return {"ok": False, "reason": "needs mongodb + gemini", "indexed": 0}
    try:
        coll = _coll()
        n = 0
        for p in PRECEDENTS:
            doc = coll.find_one({"id": p["id"]}, {"embedding": 1})
            if doc and doc.get("embedding"):
                continue
            emb = _embed(f"{p['title']}. {p['text']} Legal basis: {p['basis']}.")
            coll.update_one({"id": p["id"]}, {"$set": {**p, "embedding": emb}}, upsert=True)
            n += 1
        indexed = _ensure_index(coll)
        return {"ok": True, "embedded": n, "total": len(PRECEDENTS), "atlas_index": indexed}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "reason": f"{type(e).__name__}: {str(e)[:80]}", "indexed": 0}


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


def retrieve(query: str, k: int = 2) -> list[dict]:
    """Atlas $vectorSearch for the most relevant precedent(s); cosine fallback if the
    index isn't provisioned yet. Returns [{id,title,basis,jurisdiction,score,via}]."""
    s = get_settings()
    if not (s.mongodb_ready and s.gemini_ready):
        return []
    try:
        qv = _embed(query, task="RETRIEVAL_QUERY")
        coll = _coll()
        try:  # real Atlas Vector Search
            cur = coll.aggregate([
                {"$vectorSearch": {"index": INDEX, "path": "embedding", "queryVector": qv, "numCandidates": 50, "limit": k}},
                {"$project": {"_id": 0, "id": 1, "title": 1, "basis": 1, "jurisdiction": 1, "score": {"$meta": "vectorSearchScore"}}},
            ])
            hits = list(cur)
            if hits:
                for h in hits:
                    h["via"] = "atlas_vector_search"
                return hits
        except Exception:
            pass
        # fallback: cosine over the same stored Gemini embeddings (index still building)
        docs = list(coll.find({"embedding": {"$exists": True}}, {"_id": 0, "id": 1, "title": 1, "basis": 1, "jurisdiction": 1, "embedding": 1}))
        scored = sorted(({**{kk: d[kk] for kk in ("id", "title", "basis", "jurisdiction")}, "score": round(_cosine(qv, d["embedding"]), 4), "via": "cosine_fallback"} for d in docs), key=lambda x: -x["score"])
        return scored[:k]
    except Exception:
        return []


def status() -> dict:
    s = get_settings()
    if not (s.mongodb_ready and s.gemini_ready):
        return {"enabled": False}
    try:
        coll = _coll()
        return {"enabled": True, "precedents": coll.count_documents({"embedding": {"$exists": True}}),
                "index": INDEX, "model": EMBED_MODEL, "dims": DIM}
    except Exception:
        return {"enabled": False}
