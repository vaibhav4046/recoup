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
    {"id": "train_delay", "kind": "train_delay", "title": "Train delay refund (Delay Repay)",
     "jurisdiction": "UK", "basis": "National Rail Conditions of Travel; Delay Repay scheme",
     "text": "UK rail passengers can claim compensation under Delay Repay when a train is delayed, typically from 15 or 30 minutes, scaled to the delay length and ticket price. It is a one-time refund claimed from the operating train company, not a recurring saving."},
    {"id": "telecom_overcharge", "kind": "telecom", "title": "Telecom / broadband billing error or mid-contract hike",
     "jurisdiction": "US/UK", "basis": "FCC Truth-in-Billing rules; UK Ofcom General Conditions C1",
     "text": "Carriers must bill accurately and disclose price changes. Undisclosed mid-contract increases or erroneous line items can be disputed; in the UK an unexpected price rise outside the contract terms can be a right-to-exit trigger. Recoverable value is the disputed delta."},
    {"id": "insurance_renewal", "kind": "insurance", "title": "Insurance auto-renewal loyalty penalty",
     "jurisdiction": "UK", "basis": "FCA General Insurance Pricing Practices (PS21/5)",
     "text": "Insurers may not quote a renewal price higher than they would offer an equivalent new customer (the 'loyalty penalty' ban). A renewal priced above the new-customer rate can be challenged and re-priced; the recoverable amount is the one-time premium difference."},
    {"id": "missing_refund", "kind": "missing_refund", "title": "Promised refund never received",
     "jurisdiction": "US/UK/EU", "basis": "Fair Credit Billing Act; UK Consumer Rights Act 2015; chargeback rights",
     "text": "When a merchant confirms a refund but no credit appears within their stated window (often 5-10 business days), the customer can follow up citing the confirmation and, if unresolved, raise a card chargeback. Recoverable value is the one-time refund amount."},
    {"id": "tax_overpayment", "kind": "tax_overpayment", "title": "Overpaid tax / unclaimed tax refund",
     "jurisdiction": "US/UK", "basis": "IRS refund claims (US); HMRC overpayment relief (UK)",
     "text": "Overpaid income tax or unclaimed allowances can be reclaimed directly from the tax authority within statutory time limits (generally up to 3-4 years). It is a one-time recovery filed on the official government portal — never through a third party that takes a cut."},
]


# UNTAGGED variants — no `kind` field on purpose: these are retrievable ONLY by semantic /
# token similarity, so vector search is load-bearing (a kind-keyed dict lookup cannot find them).
PRECEDENT_VARIANTS = [
    {"id": "v_ca_arl", "title": "California Automatic Renewal Law (ARL)", "jurisdiction": "US-CA",
     "basis": "Cal. Bus. & Prof. Code 17600-17606",
     "text": "California requires clear-and-conspicuous disclosure of auto-renewal terms, affirmative consent, and an online cancellation path. Charges after a non-compliant signup are recoverable as unconditional gifts under the statute."},
    {"id": "v_chargeback_window", "title": "Card-network chargeback time limits", "jurisdiction": "US/Global",
     "basis": "Visa/Mastercard dispute rules; FCBA backstop",
     "text": "Most card networks allow disputes 60-120 days from the statement or expected-delivery date. Missing the network window does not extinguish FCBA billing-error rights if written notice reaches the issuer within 60 days of the statement."},
    {"id": "v_gym_cooloff", "title": "Health-club cooling-off and pro-rata refund statutes", "jurisdiction": "US states/UK",
     "basis": "State health-club acts (e.g. NY GBL 627a); UK CRA 2015",
     "text": "Many states give 3-10 day cooling-off rights on gym contracts and mandate pro-rata refunds on cancellation for relocation or medical reasons. Clubs that obstruct cancellation often owe the post-notice charges back."},
    {"id": "v_resort_fee", "title": "Hotel resort/junk-fee disclosure", "jurisdiction": "US",
     "basis": "FTC Junk Fees Rule; state UDAP",
     "text": "Mandatory resort or destination fees not included in the advertised room rate are challengeable as deceptive drip pricing; the undisclosed portion is refundable on dispute."},
    {"id": "v_downgrade", "title": "Airline involuntary downgrade reimbursement", "jurisdiction": "EU/UK",
     "basis": "EC 261/2004 Art. 10; UK261",
     "text": "A passenger seated in a lower class than booked is owed 30-75% of the ticket price back within 7 days, scaled by flight distance — separate from delay compensation."},
    {"id": "v_bank_fee", "title": "Bank fee goodwill-refund practice", "jurisdiction": "US/UK",
     "basis": "Reg E error resolution; FCA fair-treatment guidance",
     "text": "Overdraft and NSF fees triggered by bank-side errors, double-pulls, or misposted transactions are refundable on written dispute; first-instance goodwill reversals are routine when requested promptly."},
    {"id": "v_price_match", "title": "Retail price-adjustment windows", "jurisdiction": "US/UK",
     "basis": "Merchant price-protection policies",
     "text": "Large retailers refund the difference if the same item's price drops within a stated window (commonly 14-30 days). The claim is contractual: cite the policy, the order number, and the dated lower price."},
    {"id": "v_gift_card", "title": "Gift-card balance escheat and fee limits", "jurisdiction": "US",
     "basis": "Federal CARD Act; state escheat laws",
     "text": "Gift cards cannot expire before five years and dormancy fees are restricted; lapsed balances often escheat to the state where they remain claimable by the owner indefinitely."},
    {"id": "v_etf", "title": "Telecom early-termination fee proration", "jurisdiction": "US",
     "basis": "FCC consumer rules; carrier contracts",
     "text": "Early-termination fees must generally prorate down over the contract term; a flat ETF charged late in the term is challengeable, and carrier-caused service failures support full waiver."},
    {"id": "v_app_store", "title": "App store accidental/duplicate purchase refunds", "jurisdiction": "Global",
     "basis": "Apple/Google refund policies; EU CRD 14-day right",
     "text": "In-app and app purchases are refundable for accidental buys, duplicates, or non-delivery via the platform's refund flow; EU consumers additionally hold a 14-day withdrawal right on digital purchases not yet consumed."},
    {"id": "v_auth_hold", "title": "Duplicate authorization holds vs posted charges", "jurisdiction": "US/Global",
     "basis": "Network authorization rules",
     "text": "A pending authorization alongside a posted charge usually self-reverses in 1-7 days; a duplicate that POSTS is a billing error disputable with the merchant first, then the issuer."},
    {"id": "v_trial_dark", "title": "Negative-option dark patterns enforcement", "jurisdiction": "US",
     "basis": "FTC Act Sec. 5; ROSCA",
     "text": "Pre-checked boxes, hidden tick-to-cancel terms, and obstructed cancellation flows are deceptive practices; charges flowing from them are refundable and the FTC actively enforces against them."},
    {"id": "v_deposit_interest", "title": "Security-deposit interest obligations", "jurisdiction": "US states",
     "basis": "State landlord-tenant statutes",
     "text": "Several states require landlords to hold deposits in interest-bearing accounts and return the accrued interest with the deposit; failure can trigger statutory multiples as penalties."},
    {"id": "v_sub_pause", "title": "Subscription pause and downgrade rights", "jurisdiction": "US/EU",
     "basis": "FTC Click-to-Cancel; EU UCPD",
     "text": "Where a service advertises pause or downgrade options, refusing them while continuing to bill full price supports a partial-refund claim for the difference."},
    {"id": "v_rental_damage", "title": "Rental-car damage claim documentation burden", "jurisdiction": "US/EU",
     "basis": "Rental agreements; card CDW benefits",
     "text": "Damage claims require condition reports, repair invoices, and fleet-utilization logs on request; undocumented claims are routinely reversed, and card collision-damage coverage often pays what remains."},
    {"id": "v_wage_unclaimed", "title": "Unclaimed final wages and payroll checks", "jurisdiction": "US",
     "basis": "State wage payment laws; escheat",
     "text": "Uncashed paychecks and final wages owed by former employers escheat to the state after the dormancy period and remain claimable by the worker through the state unclaimed-property portal."},
]


def _embed(text: str, task: str = "RETRIEVAL_DOCUMENT") -> list[float]:
    # query-embedding cache: retrieval queries are low-cardinality (kind+merchant), so a cached
    # vector skips a live embed call and keeps the hot path off the free-tier quota.
    from . import llm_cache
    ck = f"{task}|{text[:2000]}"
    hit = llm_cache.get_vec(EMBED_MODEL, ck)
    if hit is not None:
        return hit
    import httpx
    s = get_settings()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{EMBED_MODEL}:embedContent"
    body = {"model": f"models/{EMBED_MODEL}", "content": {"parts": [{"text": text[:2000]}]}, "taskType": task, "outputDimensionality": DIM}
    r = httpx.post(url, params={"key": s.google_api_key}, json=body, timeout=20)
    r.raise_for_status()
    vec = r.json()["embedding"]["values"]
    llm_cache.put_vec(EMBED_MODEL, ck, vec)
    return vec


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
        corpus = PRECEDENTS + PRECEDENT_VARIANTS  # variants are untagged -> reachable only by vector/keyword similarity
        for p in corpus:
            doc = coll.find_one({"id": p["id"]}, {"embedding": 1})
            if doc and doc.get("embedding"):
                continue
            emb = _embed(f"{p['title']}. {p['text']} Legal basis: {p['basis']}.")
            coll.update_one({"id": p["id"]}, {"$set": {**p, "embedding": emb}}, upsert=True)
            n += 1
        indexed = _ensure_index(coll)
        return {"ok": True, "embedded": n, "total": len(corpus), "atlas_index": indexed}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "reason": f"{type(e).__name__}: {str(e)[:80]}", "indexed": 0}


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


def retrieve(query: str, k: int = 2, kind: str = "") -> list[dict]:
    """Atlas $vectorSearch for the most relevant precedent(s); cosine fallback if the
    index isn't provisioned yet; keyword fallback if embeddings are unavailable.
    Returns [{id,title,basis,jurisdiction,score,via}]."""
    s = get_settings()
    if not (s.mongodb_ready and s.gemini_ready):
        kb = _keyword_best(PRECEDENTS + PRECEDENT_VARIANTS, query, kind)
        return [kb] if kb else []
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
        kb = _keyword_best(PRECEDENTS + PRECEDENT_VARIANTS, query, kind)  # embedding/DB down -> stay grounded
        return [kb] if kb else []


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
    {"id": "pb_train_delay", "kind": "train_delay", "title": "Claim a UK train Delay Repay refund", "basis": "National Rail Conditions of Travel; Delay Repay",
     "text": "1) Note the booked vs actual arrival time and the delay length. 2) Keep your ticket / booking reference. 3) File the operating train company's Delay Repay form within 28 days. 4) The payout scales with the delay band (e.g. 15-29 / 30-59 / 60+ min). 5) Escalate to the Rail Ombudsman if rejected unfairly."},
    {"id": "pb_telecom", "kind": "telecom", "title": "Dispute a telecom / broadband overcharge or hike", "basis": "FCC Truth-in-Billing; UK Ofcom General Conditions",
     "text": "1) Identify the disputed line item or the mid-contract increase. 2) Notify the provider in writing and ask for the prior or new-customer rate. 3) In the UK, check whether the rise grants a penalty-free right to exit. 4) If unresolved, file with the regulator/ombudsman. 5) Keep the bill showing the change as evidence."},
    {"id": "pb_insurance_renewal", "kind": "insurance", "title": "Challenge an insurance loyalty-penalty renewal", "basis": "FCA General Insurance Pricing Practices (PS21/5)",
     "text": "1) Get the renewal quote and an equivalent new-customer quote. 2) If the renewal is higher, cite the FCA loyalty-penalty ban and ask them to match the new-customer price. 3) If they refuse, switch and/or complain. 4) Escalate to the Financial Ombudsman Service. 5) The recoverable amount is the one-time premium difference."},
    {"id": "pb_missing_refund", "kind": "missing_refund", "title": "Follow up on a promised refund that never arrived", "basis": "Fair Credit Billing Act; UK Consumer Rights Act 2015",
     "text": "1) Find the merchant's refund confirmation (email/order ID) and the promised date. 2) Email referencing the confirmation and the elapsed window. 3) If still unpaid after their stated window, raise a card chargeback for the agreed amount. 4) Attach the confirmation as evidence. 5) The issuer must investigate a documented non-receipt."},
    {"id": "pb_student_deposit", "kind": "deposit", "title": "Recover a student accommodation deposit", "basis": "UK Tenancy Deposit Schemes (TDP); state landlord-tenant statutes",
     "text": "1) Confirm the deposit was protected in a government-approved scheme (UK) and note the protected amount. 2) Request return in writing at tenancy end, with your forwarding address. 3) Dispute any deduction lacking itemized evidence via the scheme's free ADR. 4) Unprotected deposits can trigger statutory penalties. 5) Keep the inventory/check-out report as evidence."},
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


def _tokens(t: str) -> set:
    return {w for w in "".join(c if c.isalnum() else " " for c in t.lower()).split() if len(w) > 2}


def _keyword_best(corpus: list[dict], query: str, kind: str = "") -> dict | None:
    """Embedding-free last resort: kind match first, then token overlap on title+basis+kind.
    Keeps the legal basis + playbook text alive through a TOTAL Gemini outage (429/quota)."""
    q = _tokens(query)
    best, best_score = None, -1.0
    for p in corpus:
        score = 3.0 if (kind and p.get("kind") == kind) else 0.0
        score += len(q & _tokens(f"{p.get('title','')} {p.get('basis','')} {p.get('kind','')}")) * 0.5
        if score > best_score:
            best, best_score = p, score
    if best is None or best_score <= 0:
        return None
    return {**{k: best.get(k) for k in ("id", "title", "basis", "kind", "text") if k in best},
            "score": round(min(best_score / 6.0, 0.99), 4), "via": "keyword_fallback"}


def retrieve_playbook(query: str, kind: str = "") -> dict | None:
    """Atlas $vectorSearch the single best recovery playbook for a charge (cosine fallback;
    embedding-free keyword fallback if Gemini embeddings are unavailable, e.g. quota-exhausted)."""
    s = get_settings()
    if not (s.mongodb_ready and s.gemini_ready):
        return _keyword_best(PLAYBOOKS, query, kind)
    try:
        qv = _embed(query, task="RETRIEVAL_QUERY")
        coll = _pb_coll()
        try:
            cur = coll.aggregate([
                {"$vectorSearch": {"index": PLAYBOOK_INDEX, "path": "embedding", "queryVector": qv, "numCandidates": 50, "limit": 4}},
                {"$project": {"_id": 0, "id": 1, "title": 1, "basis": 1, "kind": 1, "text": 1, "score": {"$meta": "vectorSearchScore"}}},
            ])
            hits = list(cur)
            if hits:
                # kind-aware rerank: a generic merchant name can sit semantically closer to the WRONG
                # playbook (verified: a 'settlement' charge matched a utility playbook). When the
                # charge's kind is known and a kind-tagged playbook is in the top hits, prefer it.
                pick = next((h for h in hits if kind and h.get("kind") == kind), hits[0])
                pick["via"] = "atlas_vector_search"
                return pick
        except Exception:
            pass
        docs = list(coll.find({"embedding": {"$exists": True}}, {"_id": 0, "id": 1, "title": 1, "basis": 1, "kind": 1, "text": 1, "embedding": 1}))
        if not docs:
            return _keyword_best(PLAYBOOKS, query, kind)
        ranked = sorted(docs, key=lambda d: _cosine(qv, d["embedding"]), reverse=True)[:4]
        best = next((d for d in ranked if kind and d.get("kind") == kind), ranked[0])
        return {**{kk: best[kk] for kk in ("id", "title", "basis", "kind", "text")}, "score": round(_cosine(qv, best["embedding"]), 4), "via": "cosine_fallback"}
    except Exception:
        # embedding call failed (quota/network) -> grounded keyword fallback, never None-grounding
        return _keyword_best(PLAYBOOKS, query, kind)
