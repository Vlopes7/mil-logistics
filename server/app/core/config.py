from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Mil Logistics API"
    api_v1_prefix: str = "/api/v1"
    mongo_url: str = "mongodb://localhost:27017/mil-logistics"
    mongo_database: str = "mil-logistics"
    api_cors_origins: str = "http://localhost:5173"
    decision_provider: str = "laya"
    laya_model: str = ""
    laya_review_threshold: float = 0.75

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.api_cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
