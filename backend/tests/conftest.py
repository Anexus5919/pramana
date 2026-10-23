import os
import sys
import tempfile
from pathlib import Path

# Isolate every test session from the developer's var/ directory before pramana is imported
_TMP = Path(tempfile.mkdtemp(prefix="pramana-test-"))
os.environ["PRAMANA_DATA_DIR"] = str(_TMP)
# Tests are deterministic: no language model, whatever backend/.env enables for demos
os.environ["PRAMANA_LLM_PROVIDERS"] = ""
# The API tests assert on finished runs, so validation stays synchronous here; test_platform turns it on
os.environ["PRAMANA_BACKGROUND_RUNS"] = "false"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import logging  # noqa: E402

for _n in ("pyhanko", "pyhanko_certvalidator", "pdfminer", "RapidOCR"):
    logging.getLogger(_n).setLevel(logging.CRITICAL)

import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _no_login_throttling():
    # Each test starts with empty login counters; test_platform checks the throttle on its own
    from pramana import throttle

    throttle.reset()
    yield
