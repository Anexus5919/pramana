"""Builds the public demo's data on a machine that has the fine-tuned model, then packs it for deploy/server/setup.sh.

QR codes carry the public address, so the fixtures are made for it. The server runs without the model and reuses the
fields read here: validation reprocesses only documents that were never processed.

Usage, from the repository root (Ollama serving pramana-extract-v2 unless --no-model):
    backend/.venv/Scripts/python deploy/make_snapshot.py https://<public host> <out.tar.gz> [--no-model]

It replaces this checkout's var/, fixtures/out/ and demo trust anchors, so run it in a spare checkout.
"""

import argparse
import json
import os
import subprocess
import sys
import tarfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
# Everything the app reads at run time that the fixture and seed steps write
PARTS = ["var", "backend/trust/demo", "backend/trust/demo-c2pa", "fixtures/out"]


def require_model(url: str, model: str) -> None:
    """Stop before seeding when the model is not served: the seed would silently fall back to reading without it."""
    try:
        with urllib.request.urlopen(f"{url.rstrip('/')}/api/tags", timeout=10) as r:
            names = {m["name"].split(":")[0] for m in json.loads(r.read()).get("models", [])}
    except OSError as e:
        sys.exit(f"Ollama is not answering at {url} ({e}); start it, or pass --no-model")
    if model.split(":")[0] not in names:
        sys.exit(f"Ollama does not serve {model}; create it, or pass --no-model")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("public_url")
    ap.add_argument("out")
    ap.add_argument("--no-model", action="store_true")
    args = ap.parse_args()

    env = {**os.environ, "PRAMANA_PUBLIC_BASE_URL": args.public_url.rstrip("/")}
    env["PRAMANA_LLM_PROVIDERS"] = "" if args.no_model else "ollama"
    if not args.no_model:
        env.setdefault("PRAMANA_OLLAMA_MODEL", "pramana-extract-v2")
        require_model(env.get("PRAMANA_OLLAMA_URL", "http://127.0.0.1:11434"), env["PRAMANA_OLLAMA_MODEL"])
    for script in ("scripts/make_fixtures.py", "scripts/seed.py"):
        subprocess.run([sys.executable, script], cwd=BACKEND, env=env, check=True)

    with tarfile.open(args.out, "w:gz") as tar:
        for part in PARTS:
            tar.add(ROOT / part, arcname=part)
    print(f"wrote {args.out} ({Path(args.out).stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
