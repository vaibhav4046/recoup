"""Recoup — MongoDB adapter (partner integration / case store).

Stores approved recovery cases in MongoDB (free Atlas M0). Active when
MONGODB_URI is set; no-op + available:false otherwise. The MongoDB MCP server
exposes these same collections to the agent as tools (see docs).
"""
from __future__ import annotations

from functools import lru_cache

from .config import get_settings


def available() -> bool:
    return get_settings().mongodb_ready


@lru_cache(maxsize=1)
def client():
    """ONE shared, thread-safe, connection-pooled MongoClient for the whole process.
    Fast-fail timeouts so an Atlas blip degrades in ~3s instead of pymongo's 30s default
    (a 30s server-selection stall would otherwise freeze the single uvicorn event loop)."""
    from pymongo import MongoClient  # lazy
    s = get_settings()
    return MongoClient(s.mongodb_uri, serverSelectionTimeoutMS=3000, connectTimeoutMS=3000)


def db():
    return client()[get_settings().mongodb_db]


def _coll():
    return db()["cases"]


def save_case(action: dict) -> dict:
    if not available():
        return {"saved": False, "reason": "mongodb-not-configured"}
    _coll().update_one({"id": action["id"]}, {"$set": action}, upsert=True)
    return {"saved": True}


def list_cases() -> list[dict]:
    if not available():
        return []
    return list(_coll().find({}, {"_id": 0}))
