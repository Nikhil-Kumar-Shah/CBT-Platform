"""PostgreSQL Database Auto-Bootstrap Module for CBT Platform.

Automatically ensures that the target application database (e.g. 'cbt') exists
on the configured PostgreSQL server (such as Azure Database for PostgreSQL)
before application startup and Alembic migrations.
"""

import os
import re
from typing import Any, Dict, Optional
from urllib.parse import urlparse, unquote

from backend.app.core.config import settings
from backend.app.core.logging import logger

SAFE_DB_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9_]+$")


def scrub_credentials(text: str) -> str:
    """Removes passwords and sensitive credentials from connection strings and error logs."""
    if not text:
        return ""
    # Scrub URL password components: :password@ -> :***@
    scrubbed = re.sub(r":([^/@:\s]+)@", r":***@", str(text))
    # Scrub password=xxx in key-value connection strings
    scrubbed = re.sub(r"(password=)[^\s]+", r"\1***", scrubbed, flags=re.IGNORECASE)
    return scrubbed


def parse_postgres_conn_info(db_url: Optional[str] = None) -> Dict[str, Any]:
    """Extracts connection parameters for PostgreSQL from settings or explicit URL.
    
    Supports discrete POSTGRES_* environment variables as well as full DATABASE_URL strings.
    """
    raw_url = db_url or settings.effective_database_url or ""
    
    # Defaults
    host = settings.POSTGRES_HOST or "127.0.0.1"
    port = settings.POSTGRES_PORT or 5432
    user = settings.POSTGRES_USER or "postgres"
    password = settings.POSTGRES_PASSWORD or ""
    target_db = settings.POSTGRES_DATABASE or "cbt"
    bootstrap_db = settings.POSTGRES_BOOTSTRAP_DATABASE or "postgres"
    sslmode = settings.POSTGRES_SSLMODE

    if raw_url and ("postgres" in raw_url.lower()):
        # Try robust regex first for URLs with special characters (like unencoded @ in passwords)
        m = re.match(r"^postgresql(?:\+[a-zA-Z0-9_]+)?://([^:]+):(.*)@([^@/:]+)(?::([0-9]+))?/([^?]+)(?:\?(.*))?$", raw_url)
        if m:
            user = unquote(m.group(1))
            password = unquote(m.group(2))
            host = m.group(3)
            port = int(m.group(4)) if m.group(4) else 5432
            target_db = m.group(5).strip("/")
            q = m.group(6)
            if q:
                query_params = dict(qp.split("=", 1) for qp in q.split("&") if "=" in qp)
                if "sslmode" in query_params:
                    sslmode = query_params["sslmode"]
        else:
            # Standard urlparse fallback
            norm_url = re.sub(r"^postgresql\+[a-zA-Z0-9_]+://", "postgresql://", raw_url)
            parsed = urlparse(norm_url)
            if parsed.hostname:
                host = parsed.hostname
            if parsed.port:
                port = parsed.port
            if parsed.username:
                user = unquote(parsed.username)
            if parsed.password:
                password = unquote(parsed.password)
            if parsed.path and parsed.path.strip("/"):
                target_db = parsed.path.strip("/")
            if parsed.query:
                query_params = dict(qp.split("=", 1) for qp in parsed.query.split("&") if "=" in qp)
                if "sslmode" in query_params:
                    sslmode = query_params["sslmode"]

    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "target_db": target_db,
        "bootstrap_db": bootstrap_db,
        "sslmode": sslmode,
    }


def get_target_db_name() -> str:
    """Returns the configured target PostgreSQL database name."""
    info = parse_postgres_conn_info()
    return info["target_db"]


def bootstrap_postgres_database(
    target_db: Optional[str] = None,
    bootstrap_db: Optional[str] = None,
    raise_on_failure: bool = True,
) -> bool:
    """Ensures the target PostgreSQL database exists on the PostgreSQL server.

    Connects first to the administrative bootstrap database (default 'postgres'),
    checks if the target database (default 'cbt') exists via pg_database catalog,
    and safely creates it if absent.
    
    Handles race conditions (concurrent startup processes) idempotently.
    """
    conn_info = parse_postgres_conn_info()
    target = target_db or conn_info["target_db"]
    bootstrap = bootstrap_db or conn_info["bootstrap_db"]
    host = conn_info["host"]
    port = conn_info["port"]
    user = conn_info["user"]
    password = conn_info["password"]
    sslmode = conn_info["sslmode"]

    if not SAFE_DB_NAME_PATTERN.match(target):
        err = f"Invalid target database name '{target}'. Name must contain only alphanumeric characters and underscores."
        logger.error(err)
        if raise_on_failure:
            raise ValueError(err)
        return False

    if not SAFE_DB_NAME_PATTERN.match(bootstrap):
        err = f"Invalid bootstrap database name '{bootstrap}'. Name must contain only alphanumeric characters and underscores."
        logger.error(err)
        if raise_on_failure:
            raise ValueError(err)
        return False

    # Import psycopg (v3)
    try:
        import psycopg
        from psycopg.errors import DuplicateDatabase, InsufficientPrivilege, OperationalError
    except ImportError:
        try:
            import psycopg2 as psycopg
            from psycopg2.errors import DuplicateDatabase, InsufficientPrivilege, OperationalError
        except ImportError as e:
            err = f"PostgreSQL driver (psycopg or psycopg2) is not installed: {e}"
            logger.error(err)
            if raise_on_failure:
                raise RuntimeError(err) from e
            return False

    logger.info("Checking PostgreSQL database: %s", target)

    # 1. Connect to administrative bootstrap database
    bootstrap_kwargs: Dict[str, Any] = {
        "host": host,
        "port": port,
        "user": user,
        "dbname": bootstrap,
        "connect_timeout": settings.DB_CONNECT_TIMEOUT,
        "autocommit": True,
    }
    if password:
        bootstrap_kwargs["password"] = password
    if sslmode:
        bootstrap_kwargs["sslmode"] = sslmode

    try:
        with psycopg.connect(**bootstrap_kwargs) as conn:
            with conn.cursor() as cur:
                # System catalog check using parameterized query
                cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (target,))
                exists = cur.fetchone() is not None

                if exists:
                    logger.info("Database %s already exists", target)
                else:
                    logger.info("Database %s does not exist. Creating database.", target)
                    try:
                        # CREATE DATABASE cannot run in a multi-command transaction block;
                        # autocommit is enabled on the connection.
                        cur.execute(f'CREATE DATABASE "{target}"')
                        logger.info("Database %s created successfully", target)
                    except DuplicateDatabase:
                        # Graceful handling of concurrent startup race condition
                        logger.info("Database %s was created concurrently by another process.", target)
                    except Exception as create_exc:
                        exc_msg = str(create_exc).lower()
                        if "already exists" in exc_msg or "42p04" in exc_msg:
                            logger.info("Database %s already exists (concurrent creation).", target)
                        else:
                            raise create_exc
    except InsufficientPrivilege as perm_err:
        safe_msg = (
            f"User '{user}' has insufficient privileges to create database '{target}' on Azure PostgreSQL "
            f"(Host: {host}). Please grant the CREATE DATABASE privilege or provision the database in Azure."
        )
        logger.error("Failed to initialize PostgreSQL database: %s", safe_msg)
        if raise_on_failure:
            raise PermissionError(safe_msg) from perm_err
        return False
    except OperationalError as op_err:
        safe_err = scrub_credentials(str(op_err))
        logger.error("Failed to initialize PostgreSQL database (bootstrap connection): %s", safe_err)
        if raise_on_failure:
            raise RuntimeError(f"Failed to connect to PostgreSQL bootstrap database: {safe_err}") from op_err
        return False
    except Exception as exc:
        safe_err = scrub_credentials(str(exc))
        logger.error("Failed to initialize PostgreSQL database: %s", safe_err)
        if raise_on_failure:
            raise RuntimeError(f"PostgreSQL database bootstrap error: {safe_err}") from exc
        return False

    # 2. Verify connection to target database
    target_kwargs: Dict[str, Any] = {
        "host": host,
        "port": port,
        "user": user,
        "dbname": target,
        "connect_timeout": settings.DB_CONNECT_TIMEOUT,
    }
    if password:
        target_kwargs["password"] = password
    if sslmode:
        target_kwargs["sslmode"] = sslmode

    try:
        with psycopg.connect(**target_kwargs) as target_conn:
            with target_conn.cursor() as cur:
                cur.execute("SELECT 1")
        logger.info("Connected to PostgreSQL database: %s", target)
        return True
    except Exception as exc:
        safe_err = scrub_credentials(str(exc))
        logger.error("Failed to connect to target PostgreSQL database '%s': %s", target, safe_err)
        if raise_on_failure:
            raise RuntimeError(f"Failed to connect to target database '{target}': {safe_err}") from exc
        return False
