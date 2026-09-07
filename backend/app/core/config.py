from pathlib import Path
from typing import List, Optional
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
ENV_FILE_PATH = PROJECT_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(ENV_FILE_PATH), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_ENV: str = "development"
    APP_NAME: str = "CBT Platform API"
    APP_DEBUG: bool = True
    TESTING: bool = False

    # PostgreSQL & Database Configuration
    POSTGRES_HOST: Optional[str] = None
    POSTGRES_PORT: Optional[int] = None
    POSTGRES_USER: Optional[str] = None
    POSTGRES_PASSWORD: Optional[str] = None
    POSTGRES_BOOTSTRAP_DATABASE: str = "postgres"
    POSTGRES_DATABASE: str = "cbt"
    POSTGRES_SSLMODE: Optional[str] = None

    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@127.0.0.1:5433/cbt"
    DB_POOL_SIZE: int = 15
    DB_MAX_OVERFLOW: int = 25
    DB_POOL_TIMEOUT: int = 10
    DB_CONNECT_TIMEOUT: int = 15
    DB_POOL_RECYCLE: int = 300  # 5 minutes
    DB_POOL_PRE_PING: bool = False
    DB_ECHO_SQL: bool = False

    @property
    def effective_database_url(self) -> str:
        """Returns effective database URL, safely normalizing/encoding credentials."""
        from urllib.parse import quote_plus, unquote
        import re

        if self.POSTGRES_HOST:
            user = quote_plus(self.POSTGRES_USER or "postgres")
            pwd = quote_plus(self.POSTGRES_PASSWORD) if self.POSTGRES_PASSWORD else ""
            port = self.POSTGRES_PORT or 5432
            db = self.POSTGRES_DATABASE or "cbt"
            auth = f"{user}:{pwd}@" if pwd else f"{user}@"
            ssl = f"?sslmode={self.POSTGRES_SSLMODE}" if self.POSTGRES_SSLMODE else ""
            return f"postgresql+psycopg://{auth}{self.POSTGRES_HOST}:{port}/{db}{ssl}"

        # If DATABASE_URL is set, ensure password and user are cleanly URL-encoded so special characters (like @) don't break host resolution
        raw = self.DATABASE_URL
        if raw and "postgres" in raw.lower():
            m = re.match(r"^(postgresql(?:\+[a-zA-Z0-9_]+)?)://([^:]+):(.*)@([^@/:]+)(?::([0-9]+))?/([^?]+)(?:\?(.*))?$", raw)
            if m:
                scheme = m.group(1)
                # Normalize psycopg2 driver schema to psycopg (v3) for SQLAlchemy 2.0
                if "+psycopg2" in scheme:
                    scheme = scheme.replace("+psycopg2", "+psycopg")
                user = quote_plus(unquote(m.group(2)))
                pwd = quote_plus(unquote(m.group(3)))
                host = m.group(4)
                port = f":{m.group(5)}" if m.group(5) else ""
                db = m.group(6)
                query = f"?{m.group(7)}" if m.group(7) else ""
                return f"{scheme}://{user}:{pwd}@{host}{port}/{db}{query}"
        return self.DATABASE_URL

    SECRET_KEY: str = "dev_secret_key_antigravity_cbt_2026_safe_local"

    SESSION_COOKIE_NAME: str = "cbt_admin_session"
    SESSION_DURATION: int = 86400  # seconds (24 hours)
    SESSION_COOKIE_SECURE: Optional[bool] = None
    SESSION_COOKIE_SAMESITE: str = "lax"

    # Rate limiting thresholds (requests per minute per IP)
    RATE_LIMIT_LOGIN_PER_MINUTE: int = 5
    RATE_LIMIT_CODE_VERIFY_PER_MINUTE: int = 30
    RATE_LIMIT_ATTEMPT_START_PER_MINUTE: int = 15
    RATE_LIMIT_ANSWER_SAVE_PER_MINUTE: int = 120
    RATE_LIMIT_HEARTBEAT_PER_MINUTE: int = 30
    RATE_LIMIT_RESULT_PER_MINUTE: int = 30
    RATE_LIMIT_CSV_EXPORT_PER_MINUTE: int = 10
    ACCESS_CODE_MAX_FAILED_ATTEMPTS: int = 10
    ACCESS_CODE_LOCKOUT_SECONDS: int = 120

    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Media & Storage Configuration (Azure Blob Storage is the SOLE storage backend)
    STORAGE_BACKEND: str = "azure"
    AZURE_STORAGE_CONNECTION_STRING: Optional[str] = None
    AZURE_STORAGE_CONTAINER_NAME: str = "cbt"
    MAX_IMAGE_SIZE_BYTES: int = 5 * 1024 * 1024  # 5 MB
    MAX_IMAGE_DIMENSION: int = 4096  # max width or height in px

    @property
    def is_production(self) -> bool:
        return self.APP_ENV.lower() == "production"

    @property
    def session_cookie_secure(self) -> bool:
        """In production, cookies must always be secure (transmitted over HTTPS only)."""
        if self.is_production:
            return True
        if self.SESSION_COOKIE_SECURE is not None:
            return self.SESSION_COOKIE_SECURE
        return False

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @field_validator("SESSION_COOKIE_SAMESITE")
    @classmethod
    def validate_samesite(cls, v: str) -> str:
        val = v.lower()
        if val not in ("lax", "strict", "none"):
            raise ValueError("SESSION_COOKIE_SAMESITE must be 'lax', 'strict', or 'none'")
        return val


settings = Settings()


def validate_storage_configuration() -> bool:
    """Validate Azure Blob Storage configuration and verify active cloud connectivity.

    Azure Blob Storage is the sole media storage backend for this application.
    Local storage fallback is strictly forbidden.
    """
    from backend.app.core.logging import logger

    conn_str = settings.AZURE_STORAGE_CONNECTION_STRING
    if not conn_str or not conn_str.strip():
        raise RuntimeError(
            "CRITICAL CONFIGURATION ERROR: Azure Blob Storage is the sole required storage backend, "
            "but AZURE_STORAGE_CONNECTION_STRING is missing or empty. Please configure "
            "AZURE_STORAGE_CONNECTION_STRING in your .env file."
        )

    container_name = settings.AZURE_STORAGE_CONTAINER_NAME
    if not container_name or not str(container_name).strip():
        raise RuntimeError(
            "CRITICAL CONFIGURATION ERROR: AZURE_STORAGE_CONTAINER_NAME is missing or empty."
        )
    container_name = str(container_name).strip()

    try:
        from azure.storage.blob import BlobServiceClient
        blob_service_client = BlobServiceClient.from_connection_string(conn_str)
        # Safe storage account identifier
        account_name = getattr(blob_service_client, "account_name", "unknown")

        container_client = blob_service_client.get_container_client(container_name)
        if not container_client.exists():
            container_client.create_container()
            logger.info("Created missing Azure Blob container: %s", container_name)

        # Actively probe container properties to guarantee authentication and network connectivity
        container_client.get_container_properties()

        logger.info(
            "Azure Blob Storage: CONNECTED | Storage account: %s | Container: %s | Media storage backend: AZURE_BLOB | Media storage status: READY",
            account_name,
            container_name,
        )
        return True
    except Exception as exc:
        err = f"Failed to connect to Azure Blob Storage (container '{container_name}'): {exc}"
        logger.error(err)
        raise RuntimeError(err) from exc

