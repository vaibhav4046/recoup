"""Recoup — MongoDB Atlas Vector Search: the agent's retrieval brain.

Consumer-protection precedents are embedded with Gemini gemini-embedding-001 (768-d, free)
and stored in Atlas with a native Vector Search index. The agent embeds a charge and runs an
Atlas `$vectorSearch` aggregation to retrieve the most semantically relevant legal basis — so
each recovery is GROUNDED IN REAL PRECEDENT, not the model's imagination. Zero cost (Gemini
free tier + Atlas M0). If the Atlas vector index isn't provisioned yet, it transparently falls
back to in-process cosine over the same stored Gemini embeddings, so retrieval never breaks
during a demo.
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
    from . import mongodb  # shared pooled client (fast-fail timeouts, no per-call handshake)
    return mongodb.db()[COLL]


def _ensure_index(coll, index_name=INDEX) -> bool:
    """Create the Atlas Vector Search index if it's missing (M0+ supports it)."""
    try:
        names = [i.get("name") for i in coll.list_search_indexes()]
        if index_name in names:
            return True
        from pymongo.operations import SearchIndexModel
        coll.create_search_index(SearchIndexModel(
            definition={"fields": [{"type": "vector", "path": "embedding", "numDimensions": DIM, "similarity": "cosine"}]},
            name=index_name, type="vectorSearch"))
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
        pb = _pb_coll()
        return {"enabled": True, "precedents": coll.count_documents({"embedding": {"$exists": True}}),
                "playbooks": pb.count_documents({"embedding": {"$exists": True}}),
                "index": INDEX, "model": EMBED_MODEL, "dims": DIM}
    except Exception:
        return {"enabled": False}


# ===== Phase 3: recovery PLAYBOOKS — action steps retrieved by Atlas Vector Search =====
PLAYBOOK_COLL = "playbooks"
PLAYBOOK_INDEX = "recoup_playbook_index"
PLAYBOOKS = [
    {"id": "pb_gym_cancel", "kind": "dead_subscription", "title": "Cancel a gym / fitness membership", "basis": "FTC Click-to-Cancel Rule; UK CRA 2015; state cooling-off laws",
     "text": "1) Check the contract for the notice period and cancellation clause. 2) Send written cancellation (email + recorded letter) — many gyms refuse phone-only cancels. 3) Cite the click-to-cancel / negative-option rule if they obstruct. 4) Demand proration/refund of pre-paid unused months. 5) Revoke the card mandate as backup and dispute further charges."},
    {"id": "pb_stream_cancel", "kind": "dead_subscription", "title": "Cancel an unused streaming subscription", "basis": "FTC Click-to-Cancel Rule; UK CRA 2015 auto-renewal",
     "text": "1) Open the streaming account's billing page. 2) Use the in-app cancel flow (legally must be as easy as sign-up). 3) Turn off auto-renew and confirm the end date in writing. 4) Ask for a refund of the current unused period if it just renewed. 5) If blocked, dispute the latest charge with your card issuer."},
    {"id": "pb_eu261", "kind": "flight_comp", "title": "Claim EU261 / UK261 flight-delay cash", "basis": "Regulation (EC) 261/2004; UK261",
     "text": "1) Confirm a 3h+ arrival delay or denied boarding on an eligible route. 2) File the airline's EU261 form quoting the regulation. 3) Demand CASH (EUR250-600 by distance), not vouchers. 4) If refused on 'extraordinary circumstances', request proof. 5) Escalate to the national enforcement body (e.g. UK CAA)."},
    {"id": "pb_dup_charge", "kind": "billing_error", "title": "Dispute a duplicate or wrong charge", "basis": "Fair Credit Billing Act 15 U.S.C. 1666; Reg Z",
     "text": "1) Identify the duplicate/incorrect line and date. 2) Notify the merchant in writing within 60 days. 3) If unresolved, file a billing-error dispute (chargeback) with your card issuer. 4) Attach the receipt/evidence. 5) The issuer must investigate and credit confirmed errors."},
    {"id": "pb_trial_refund", "kind": "free_trial", "title": "Refund a free trial that auto-converted", "basis": "FTC Negative Option / ROSCA; UK CRA 2015",
     "text": "1) Find the date the trial converted to a paid charge. 2) Email within the window: you did not intend to continue and consent was unclear. 3) Demand a full refund of the first charge + immediate cancellation. 4) Cite ROSCA / negative-option clear-consent rules. 5) If refused, dispute it as an unauthorized recurring charge."},
    {"id": "pb_utility_overpay", "kind": "overpayment", "title": "Reclaim an overpaid / credit-balance utility bill", "basis": "Utility regulator rules (Ofgem/PUC); credit-balance refund rights",
     "text": "1) Check the utility account for a credit balance or estimated-vs-actual overbilling. 2) Submit an up-to-date meter reading to correct estimates. 3) Request the credit balance back as CASH, not 'rolled forward'. 4) Cite the regulator's credit-balance refund rule. 5) Escalate to the energy/utility ombudsman if not refunded in their window."},
]


def _pb_coll():
    from . import mongodb  # shared pooled client
    return mongodb.db()[PLAYBOOK_COLL]


def seed_playbooks() -> dict:
    """Embed + upsert the recovery playbooks and ensure their Atlas Vector Search index."""
    s = get_settings()
    if not (s.mongodb_ready and s.gemini_ready):
        return {"ok": False, "reason": "needs mongodb + gemini", "embedded": 0}
    try:
        coll = _pb_coll()
        n = 0
        for p in PLAYBOOKS:
            doc = coll.find_one({"id": p["id"]}, {"embedding": 1})
            if doc and doc.get("embedding"):
                continue
            emb = _embed(f"{p['title']}. {p['text']} Basis: {p['basis']}.")
            coll.update_one({"id": p["id"]}, {"$set": {**p, "embedding": emb}}, upsert=True)
            n += 1
        idx = _ensure_index(coll, PLAYBOOK_INDEX)
        return {"ok": True, "embedded": n, "total": len(PLAYBOOKS), "atlas_index": idx}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "reason": f"{type(e).__name__}: {str(e)[:80]}", "embedded": 0}


def retrieve_playbook(query: str) -> dict | None:
    """Atlas $vectorSearch the single best recovery playbook for a charge (cosine fallback)."""
    s = get_settings()
    if not (s.mongodb_ready and s.gemini_ready):
        return None
    try:
        qv = _embed(query, task="RETRIEVAL_QUERY")
        coll = _pb_coll()
        try:
            cur = coll.aggregate([
                {"$vectorSearch": {"index": PLAYBOOK_INDEX, "path": "embedding", "queryVector": qv, "numCandidates": 50, "limit": 1}},
                {"$project": {"_id": 0, "id": 1, "title": 1, "basis": 1, "kind": 1, "text": 1, "score": {"$meta": "vectorSearchScore"}}},
            ])
            hits = list(cur)
            if hits:
                hits[0]["via"] = "atlas_vector_search"
                return hits[0]
        except Exception:
            pass
        docs = list(coll.find({"embedding": {"$exists": True}}, {"_id": 0, "id": 1, "title": 1, "basis": 1, "kind": 1, "text": 1, "embedding": 1}))
        if not docs:
            return None
        best = max(docs, key=lambda d: _cosine(qv, d["embedding"]))
        return {**{kk: best[kk] for kk in ("id", "title", "basis", "kind", "text")}, "score": round(_cosine(qv, best["embedding"]), 4), "via": "cosine_fallback"}
    except Exception:
        return None
