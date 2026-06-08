"""Recoup — MongoDB adapter (partner integration / case store).

Stores approved recovery cases in MongoDB (free Atlas M0). Active when
MONGODB_URI is set; no-op + available:false otherwise. The MongoDB MCP server
exposes these same collections to the agent as tools (see docs).
"""
from __future__ import annotations

from .config import get_settings


def available() -> bool:
    return get_settings().mongodb_ready


def _coll():
    from pymongo import MongoClient  # lazy
    s = get_settings()
    return MongoClient(s.mongodb_uri)[s.mongodb_db]["cases"]


def save_case(action: dict) -> dict:
    if not available():
        return {"saved": False, "reason": "mongodb-not-configured"}
    _coll().update_one({"id": action["id"]}, {"$set": action}, upsert=True)
    return {"saved": True}


def list_cases() -> list[dict]:
    if not available():
        return []
    return list(_coll().find({}, {"_id": 0}))
