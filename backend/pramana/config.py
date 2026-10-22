from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PRAMANA_", env_file=".env", extra="ignore")

    data_dir: Path = REPO_DIR / "var"
    database_url: str | None = None
    # Fernet key for encrypting stored documents; generated into data_dir/keys on first run if unset
    storage_key: str | None = None
    session_ttl_minutes: int = 480
    max_upload_mb: int = 15
    # Shows demo accounts on the login page; never enable with real data
    demo_mode: bool = True
    demo_password: str = "Pramana@2026"
    max_pdf_pages: int = 60
    cookie_secure: bool = False
    frontend_dist: Path = REPO_DIR / "frontend" / "dist"
    rulesets_dir: Path = BACKEND_DIR / "rulesets"
    trust_dir: Path = BACKEND_DIR / "trust"
    # Optional local LLM endpoint (Ollama); the pipeline never requires it
    ollama_url: str | None = None
    ollama_model: str = "qwen2.5:3b"

    @property
    def db_url(self) -> str:
        return self.database_url or f"sqlite:///{(self.data_dir / 'pramana.db').as_posix()}"

    @property
    def storage_dir(self) -> Path:
        return self.data_dir / "documents"

    @property
    def keys_dir(self) -> Path:
        return self.data_dir / "keys"

    @property
    def cache_dir(self) -> Path:
        return self.data_dir / "cache"


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    for d in (s.data_dir, s.storage_dir, s.keys_dir, s.cache_dir):
        d.mkdir(parents=True, exist_ok=True)
    return s
