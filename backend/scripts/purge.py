"""Apply the retention policy: delete document files of applications closed or withdrawn longer ago than
the retention period, old page previews, old run progress events and long-expired sessions.

    python scripts/purge.py            # dry run: list what would be deleted
    python scripts/purge.py --apply    # delete, with an audit event per document and a summary event

Hashes, extracted fields, findings, verification records, runs and the audit chain are always kept.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main(apply: bool = False) -> dict:
    from pramana import retention
    from pramana.db import SessionLocal, init_db

    init_db()
    db = SessionLocal()
    try:
        return retention.purge(db, "retention-job", "system", dry_run=not apply)
    finally:
        db.close()


if __name__ == "__main__":
    print(json.dumps(main(apply="--apply" in sys.argv), indent=2, default=str))
