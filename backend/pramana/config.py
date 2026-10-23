from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
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
    # Fetch CRL/OCSP for India PKI signatures; off by default so demos work offline
    pki_fetch_revocation: bool = False
    # Optional grounded LLM extraction for fields the patterns miss; the pipeline never requires it.
    # Providers are tried in order. External providers also need llm_allow_external=true.
    llm_providers: str = ""  # e.g. "ollama" or "ollama,groq,gemini"
    llm_allow_external: bool = False
    llm_timeout_s: int = 60
    ollama_url: str = "http://127.0.0.1:11434"
    # Fine-tuned Qwen3-1.7B extractor built by backend/training; any Ollama model name works here
    ollama_model: str = "pramana-extract"
    groq_api_key: str | None = Field(None, validation_alias=AliasChoices("PRAMANA_GROQ_API_KEY", "GROQ_API_KEY"))
    groq_model: str = "openai/gpt-oss-20b"
    gemini_api_key: str | None = Field(None, validation_alias=AliasChoices("PRAMANA_GEMINI_API_KEY",
                                                                          "GEMINI_API_KEY", "GOOGLE_API_KEY"))
    gemini_model: str = "gemini-2.5-flash"
    # Re-verification watch: how often issuer-verified certificates are re-queried after a scrutiny outcome
    watch_interval_hours: float = 24.0
    watch_scheduler: bool = True

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
