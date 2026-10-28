from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class HandoffSettings(BaseSettings):
    """Settings for the Executive Committee handoff; same PRAMANA_ prefix and .env as the core settings."""

    model_config = SettingsConfigDict(env_prefix="PRAMANA_", env_file=".env", extra="ignore")

    # Channels that take a prepared report towards the Executive Committee, comma-separated. Only "manual" is
    # built: an officer or administrator forwards the report and records it. "aicte_portal" is the documented
    # connector (handoff.channels.AictePortalChannel); naming it before it is built changes nothing
    handoff_channels: str = "manual"


@lru_cache
def handoff_settings() -> HandoffSettings:
    return HandoffSettings()
