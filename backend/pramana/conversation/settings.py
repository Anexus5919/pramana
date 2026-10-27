from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class ConversationSettings(BaseSettings):
    """Settings for the correction-round conversation; same PRAMANA_ prefix and .env as the core settings."""

    model_config = SettingsConfigDict(env_prefix="PRAMANA_", env_file=".env", extra="ignore")

    # Channels that deliver notifications, comma-separated. Only "in_app" is built; "email" is the documented next one
    notify_channels: str = "in_app"
    # Messages and status changes one user may post per minute, across all threads
    thread_posts_per_minute: int = 12
    # A response date this many days away, or nearer, raises one reminder for the institution
    deadline_notice_days: int = 3


@lru_cache
def conversation_settings() -> ConversationSettings:
    return ConversationSettings()
