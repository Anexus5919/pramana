from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class OfficerSettings(BaseSettings):
    """Settings for the officer tools; same PRAMANA_ prefix and .env as the core settings."""

    model_config = SettingsConfigDict(env_prefix="PRAMANA_", env_file=".env", extra="ignore")

    # Default response window printed on deficiency letters; an office setting, not a handbook rule
    letter_response_days: int = 15
    # "Ask why" runs on a local Ollama model; set ask_providers="" to answer from templates only
    ask_providers: str = "ollama"
    ask_model: str = "qwen3:4b-instruct-2507-q4_K_M"
    ask_timeout_s: int = 90
    ask_max_rules: int = 8


@lru_cache
def officer_settings() -> OfficerSettings:
    return OfficerSettings()
