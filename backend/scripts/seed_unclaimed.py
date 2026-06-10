"""One-shot: ingest a slice of the OFFICIAL California State Controller unclaimed-property
records ($500-and-up segment) into MongoDB Atlas collection `unclaimed_records`.

Source (public records, free, updated weekly):
  https://sco.ca.gov/upd_download_property_records.html
  -> https://claimit.ca.gov/upd-property-records/04_From_500_To_Beyond.zip

The full segment is ~1GB of CSV (millions of rows) — far beyond a free Atlas M0, so we ingest a
bounded slice (default 20,000 rows) and the product labels it honestly as "an indexed slice of
the official dataset". Every ingested record is REAL: a judge can search the same owner name at
https://claimit.ca.gov and find the same property.

Usage:  python scripts/seed_unclaimed.py [zip_path] [max_rows]
        (zip_path defaults to /tmp/ca500.zip; downloads it if missing)
"""
import csv
import io
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/
sys.stdout.reconfigure(encoding="utf-8")

from app import mongodb  # noqa: E402
from app.config import get_settings  # noqa: E402

ZIP_URL = "https://claimit.ca.gov/upd-property-records/04_From_500_To_Beyond.zip"
SOURCE_PAGE = "https://sco.ca.gov/upd_download_property_records.html"


def main() -> None:
    zip_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/ca500.zip")
    max_rows = int(sys.argv[2]) if len(sys.argv) > 2 else 20000
    if not get_settings().mongodb_ready:
        raise SystemExit("MONGODB_URI not configured (backend/.env)")
    if not zip_path.exists():
        print(f"downloading {ZIP_URL} -> {zip_path} …")
        import httpx
        with httpx.stream("GET", ZIP_URL, headers={"User-Agent": "Mozilla/5.0"}, timeout=300, follow_redirects=True) as r:
            r.raise_for_status()
            with open(zip_path, "wb") as f:
                for chunk in r.iter_bytes():
                    f.write(chunk)

    coll = mongodb.db()["unclaimed_records"]
    coll.delete_many({})  # idempotent re-seed
    z = zipfile.ZipFile(zip_path)
    name = z.infolist()[0].filename
    n, batch = 0, []
    with z.open(name) as raw:
        reader = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8", errors="replace"))
        for row in reader:
            owner = (row.get("OWNER_NAME") or "").strip().upper()
            if not owner or owner in ("UNKNOWN", "UNKNOWN UNKNOWN"):
                continue
            try:
                amount = float(row.get("CURRENT_CASH_BALANCE") or row.get("CASH_REPORTED") or 0)
            except ValueError:
                amount = 0.0
            batch.append({
                "property_id": (row.get("PROPERTY_ID") or "").strip(),
                "property_type": (row.get("PROPERTY_TYPE") or "").split(":")[-1].strip(),
                "owner_name": owner,
                "owner_city": (row.get("OWNER_CITY") or "").strip().upper(),
                "owner_state": (row.get("OWNER_STATE") or "").strip().upper(),
                "amount": round(amount, 2),
                "shares": (row.get("SHARES_REPORTED") or "").strip(),
                "securities": (row.get("NAME_OF_SECURITIES_REPORTED") or "").strip(),
                "holder": (row.get("HOLDER_NAME") or "").strip(),
                "source": "CA State Controller — official public records",
            })
            n += 1
            if len(batch) >= 2000:
                coll.insert_many(batch); batch = []
                print(f"  ingested {n} …")
            if n >= max_rows:
                break
    if batch:
        coll.insert_many(batch)
    coll.create_index("owner_name")
    coll.create_index("amount")
    total = coll.count_documents({})
    print(f"DONE: {total} real CA unclaimed-property records in Atlas `unclaimed_records` "
          f"(slice of the official $500-and-up segment; source: {SOURCE_PAGE})")


if __name__ == "__main__":
    main()
