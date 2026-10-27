from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


_settings = get_settings()
_sqlite = _settings.db_url.startswith("sqlite")
# SQLite needs cross-thread connections and a busy timeout; PostgreSQL (postgresql+psycopg://...) gets a checked pool
engine = create_engine(_settings.db_url, connect_args={"check_same_thread": False, "timeout": 30} if _sqlite else {},
                       pool_pre_ping=not _sqlite)

if _sqlite:
    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from . import models  # noqa: F401  registers tables
    from .conversation import models as _conversation  # noqa: F401
    from .history import models as _history  # noqa: F401

    Base.metadata.create_all(engine)


def drop_all() -> None:
    """Remove every table; the seed script uses it on a database server, where there is no file to delete."""
    from . import models  # noqa: F401  registers tables
    from .conversation import models as _conversation  # noqa: F401

    Base.metadata.drop_all(engine)
