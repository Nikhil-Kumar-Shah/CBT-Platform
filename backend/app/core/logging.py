import logging
import sys
from backend.app.core.config import settings


def setup_logging() -> None:
    log_level = logging.DEBUG if settings.APP_DEBUG and not settings.is_production else logging.INFO

    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
        force=True,
    )

    # Silence overly verbose third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.INFO if settings.DB_ECHO_SQL else logging.WARNING
    )
    for noisy in (
        "azure",
        "azure.core",
        "azure.storage",
        "azure.core.pipeline.policies.http_logging_policy",
        "urllib3",
        "urllib3.connectionpool",
        "asyncio",
        "watchfiles",
    ):
        logging.getLogger(noisy).setLevel(logging.WARNING)


logger = logging.getLogger("cbt.app")
