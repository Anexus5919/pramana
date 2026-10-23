import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .api import admin, applications
from .config import get_settings
from .db import init_db
from .history import api as history_api
from .history.watch import start_scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
# pyHanko logs full tracebacks for expected diff-analysis outcomes; results are reported through the API instead
for noisy in ("pyhanko", "pyhanko_certvalidator", "pdfminer", "fontTools"):
    logging.getLogger(noisy).setLevel(logging.CRITICAL)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    watch_task = start_scheduler()
    yield
    if watch_task:
        watch_task.cancel()


app = FastAPI(title="Pramana", version="0.3.0", lifespan=lifespan,
              description="Evidence-linked application validation, document authentication and compliance "
                          "assistance. Decision support only: findings are for review by competent authorities.")
app.include_router(applications.router)
app.include_router(admin.router)
app.include_router(history_api.router)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    if request.url.path.startswith("/api"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


@app.get("/api/health")
def health():
    return {"ok": True}


_dist = get_settings().frontend_dist
if _dist.exists():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse({"detail": "not found"}, status_code=404)
        f = _dist / path
        if path and f.is_file() and _dist in f.resolve().parents:
            return FileResponse(f)
        return FileResponse(_dist / "index.html")
