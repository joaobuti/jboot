from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="JURIDICO_DATA_", extra="ignore")

    service_name: str = "juridico-data"
    datajud_base_url: Literal["https://api-publica.datajud.cnj.jus.br"] = (
        "https://api-publica.datajud.cnj.jus.br"
    )
    datajud_api_key: SecretStr = SecretStr("")
    identity_issuer: str = "jboot-identity"
    identity_jwt_secret: SecretStr = SecretStr("")
    service_audience: str = "svc:juridico-data"
    allowed_callers: str = "platform-api,juridico-worker"
    request_timeout_seconds: float = Field(default=12.0, ge=1, le=30)
    # Acompanhamento em segundo plano (ADR 021, Sprint 4): ninguem espera na tela e o chamador ja
    # serializa as consultas e repete pelo Temporal, entao uma tentativa so, com limite maior.
    background_request_timeout_seconds: float = Field(default=60.0, ge=1, le=120)
    max_attempts: int = Field(default=3, ge=1, le=4)
    max_retry_after_seconds: float = Field(default=3.0, ge=0, le=10)
    max_concurrency: int = Field(default=10, ge=1, le=100)
    min_request_interval_seconds: float = Field(default=0.2, ge=0.05, le=5)
    djen_base_url: Literal["https://comunicaapi.pje.jus.br"] = "https://comunicaapi.pje.jus.br"

    @property
    def caller_allowlist(self) -> frozenset[str]:
        return frozenset(item.strip() for item in self.allowed_callers.split(",") if item.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
