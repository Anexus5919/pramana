"""Freeze the integrity network of a random evaluation world into a synthetic snapshot.

The Integrity page can show this next to the current cycle, labelled synthetic, so a larger network can be
seen without loading a second world into the demo database.

    python scripts/random_eval.py --seed 4242 --n 30
    python scripts/network_snapshot.py --data ../var/random-eval/seed-4242-n30/data --seed 4242
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--data", type=Path, required=True, help="data directory of a random evaluation run")
    ap.add_argument("--seed", type=int, required=True)
    args = ap.parse_args()

    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    from pramana.insights.network import SNAPSHOT, build_network

    engine = create_engine(f"sqlite:///{(args.data / 'pramana.db').resolve().as_posix()}")
    with Session(engine) as db:
        net = build_network(db)
    # Findings and documents live in that run's database, not the demo's; the snapshot keeps counts only
    for e in net["edges"]:
        e["document_id"], e["page"], e["bbox"] = None, None, None
        for f in e["findings"]:
            f["id"] = ""
    n = net["stats"]["applications"]
    net.update(dataset="synthetic", synthetic=True,
               note=f"Synthetic random world from the evaluation generator, seed {args.seed}, {n} applications. "
                    "Not real institutions; findings open only in that run's own database.")
    SNAPSHOT.write_text(json.dumps(net, indent=1), encoding="utf-8")
    print(f"wrote {SNAPSHOT} ({net['stats']['clusters']} clusters, {net['stats']['shared_items']} shared items)")


if __name__ == "__main__":
    main()
