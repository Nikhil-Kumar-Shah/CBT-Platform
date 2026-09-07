"""Automated Tests for PostgreSQL Database Auto-Bootstrap Module."""

import pytest
from unittest.mock import patch, MagicMock
from psycopg.errors import DuplicateDatabase, InsufficientPrivilege, OperationalError

from backend.app.core.config import settings
from backend.app.core.db_bootstrap import (
    parse_postgres_conn_info,
    scrub_credentials,
    bootstrap_postgres_database,
    get_target_db_name,
)


def test_parse_postgres_conn_info_from_url():
    """Verify parsing connection details from standard and psycopg PostgreSQL URLs."""
    url = "postgresql+psycopg://cbt_admin:MockSecretPass%21@db-server.postgres.database.azure.com:5432/cbt?sslmode=require"
    info = parse_postgres_conn_info(url)
    assert info["host"] == "db-server.postgres.database.azure.com"
    assert info["port"] == 5432
    assert info["user"] == "cbt_admin"
    assert info["password"] == "MockSecretPass!"
    assert info["target_db"] == "cbt"
    assert info["bootstrap_db"] == "postgres"
    assert info["sslmode"] == "require"


def test_parse_postgres_conn_info_from_settings(monkeypatch):
    """Verify discrete POSTGRES_* environment variables are respected."""
    monkeypatch.setattr(settings, "POSTGRES_HOST", "azure-host.postgres.database.azure.com")
    monkeypatch.setattr(settings, "POSTGRES_PORT", 5432)
    monkeypatch.setattr(settings, "POSTGRES_USER", "AzureAdmin")
    monkeypatch.setattr(settings, "POSTGRES_PASSWORD", "Pass1234!")
    monkeypatch.setattr(settings, "POSTGRES_DATABASE", "cbt")
    monkeypatch.setattr(settings, "POSTGRES_BOOTSTRAP_DATABASE", "postgres")
    monkeypatch.setattr(settings, "POSTGRES_SSLMODE", "require")

    info = parse_postgres_conn_info()
    assert info["host"] == "azure-host.postgres.database.azure.com"
    assert info["port"] == 5432
    assert info["user"] == "AzureAdmin"
    assert info["password"] == "Pass1234!"
    assert info["target_db"] == "cbt"
    assert info["bootstrap_db"] == "postgres"
    assert info["sslmode"] == "require"


def test_scrub_credentials():
    """Verify password scrubbing from connection strings and error messages."""
    raw_url = "postgresql+psycopg://admin_user:P@ssw0rd123!@10.0.0.1:5432/cbt"
    scrubbed = scrub_credentials(raw_url)
    assert "P@ssw0rd123!" not in scrubbed
    assert "admin_user:***@" in scrubbed

    raw_str = "connection failed: host=127.0.0.1 user=admin password=SecretPassword123 dbname=cbt"
    scrubbed_str = scrub_credentials(raw_str)
    assert "SecretPassword123" not in scrubbed_str
    assert "password=***" in scrubbed_str


def test_bootstrap_invalid_database_name():
    """Verify target and bootstrap database names are strictly validated against injection."""
    with pytest.raises(ValueError, match="Invalid target database name"):
        bootstrap_postgres_database(target_db="cbt; DROP TABLE users;--", raise_on_failure=True)

    with pytest.raises(ValueError, match="Invalid bootstrap database name"):
        bootstrap_postgres_database(bootstrap_db="postgres' OR 1=1--", raise_on_failure=True)


@patch("psycopg.connect")
def test_bootstrap_when_db_already_exists(mock_connect):
    """Test 2: Target DB already exists - must NOT execute CREATE DATABASE."""
    # Bootstrap connection mock
    mock_bootstrap_conn = MagicMock()
    mock_bootstrap_cur = MagicMock()
    mock_bootstrap_conn.__enter__.return_value = mock_bootstrap_conn
    mock_bootstrap_conn.cursor.return_value.__enter__.return_value = mock_bootstrap_cur
    
    # Simulate DB exists
    mock_bootstrap_cur.fetchone.return_value = (1,)

    # Target connection mock
    mock_target_conn = MagicMock()
    mock_target_cur = MagicMock()
    mock_target_conn.__enter__.return_value = mock_target_conn
    mock_target_conn.cursor.return_value.__enter__.return_value = mock_target_cur

    mock_connect.side_effect = [mock_bootstrap_conn, mock_target_conn]

    result = bootstrap_postgres_database(target_db="cbt", bootstrap_db="postgres")

    assert result is True
    # Verify parameterized check
    mock_bootstrap_cur.execute.assert_called_once_with(
        "SELECT 1 FROM pg_database WHERE datname = %s", ("cbt",)
    )
    # Ensure CREATE DATABASE was NOT executed
    for call in mock_bootstrap_cur.execute.call_args_list:
        assert "CREATE DATABASE" not in str(call)


@patch("psycopg.connect")
def test_bootstrap_when_db_missing_creates_db(mock_connect):
    """Test 1: Target DB missing - connects to postgres, creates cbt, connects to cbt."""
    mock_bootstrap_conn = MagicMock()
    mock_bootstrap_cur = MagicMock()
    mock_bootstrap_conn.__enter__.return_value = mock_bootstrap_conn
    mock_bootstrap_conn.cursor.return_value.__enter__.return_value = mock_bootstrap_cur

    # Simulate DB does NOT exist initially
    mock_bootstrap_cur.fetchone.return_value = None

    mock_target_conn = MagicMock()
    mock_target_cur = MagicMock()
    mock_target_conn.__enter__.return_value = mock_target_conn
    mock_target_conn.cursor.return_value.__enter__.return_value = mock_target_cur

    mock_connect.side_effect = [mock_bootstrap_conn, mock_target_conn]

    result = bootstrap_postgres_database(target_db="cbt", bootstrap_db="postgres")

    assert result is True
    mock_bootstrap_cur.execute.assert_any_call(
        "SELECT 1 FROM pg_database WHERE datname = %s", ("cbt",)
    )
    mock_bootstrap_cur.execute.assert_any_call('CREATE DATABASE "cbt"')
    mock_target_cur.execute.assert_called_once_with("SELECT 1")


@patch("psycopg.connect")
def test_bootstrap_concurrent_race_condition_duplicate_database(mock_connect):
    """Test 6: Concurrent startup race condition - handles DuplicateDatabase gracefully."""
    mock_bootstrap_conn = MagicMock()
    mock_bootstrap_cur = MagicMock()
    mock_bootstrap_conn.__enter__.return_value = mock_bootstrap_conn
    mock_bootstrap_conn.cursor.return_value.__enter__.return_value = mock_bootstrap_cur

    # Simulate DB did not exist when checked
    mock_bootstrap_cur.fetchone.return_value = None
    
    # But another process created it concurrently before CREATE DATABASE ran
    dup_error = DuplicateDatabase("database 'cbt' already exists")
    mock_bootstrap_cur.execute.side_effect = [None, dup_error]

    mock_target_conn = MagicMock()
    mock_target_cur = MagicMock()
    mock_target_conn.__enter__.return_value = mock_target_conn
    mock_target_conn.cursor.return_value.__enter__.return_value = mock_target_cur

    mock_connect.side_effect = [mock_bootstrap_conn, mock_target_conn]

    result = bootstrap_postgres_database(target_db="cbt", bootstrap_db="postgres")

    assert result is True
    mock_target_cur.execute.assert_called_once_with("SELECT 1")


@patch("psycopg.connect")
def test_bootstrap_insufficient_privileges(mock_connect):
    """Test 8: Insufficient privileges on Azure - informative error without password leaks."""
    mock_bootstrap_conn = MagicMock()
    mock_bootstrap_cur = MagicMock()
    mock_bootstrap_conn.__enter__.return_value = mock_bootstrap_conn
    mock_bootstrap_conn.cursor.return_value.__enter__.return_value = mock_bootstrap_cur

    mock_bootstrap_cur.fetchone.return_value = None
    perm_err = InsufficientPrivilege("permission denied to create database")
    mock_bootstrap_cur.execute.side_effect = [None, perm_err]

    mock_connect.return_value = mock_bootstrap_conn

    with pytest.raises(PermissionError, match="insufficient privileges to create database"):
        bootstrap_postgres_database(target_db="cbt", bootstrap_db="postgres", raise_on_failure=True)


@patch("psycopg.connect")
def test_bootstrap_auth_failure_scrubbed(mock_connect):
    """Test 7: Authentication failure - error reported without leaking credentials."""
    op_err = OperationalError('password authentication failed for user "Nikhil" password="super_secret_raw_pass"')
    mock_connect.side_effect = op_err

    with pytest.raises(RuntimeError) as exc_info:
        bootstrap_postgres_database(target_db="cbt", bootstrap_db="postgres", raise_on_failure=True)

    err_str = str(exc_info.value)
    assert "super_secret_raw_pass" not in err_str
    assert "password=***" in err_str or "Failed to connect" in err_str


def test_bootstrap_live_integration():
    """Live test: Auto-bootstrap against active PostgreSQL instance."""
    # This verifies live connectivity to the local / test PostgreSQL instance
    result = bootstrap_postgres_database(target_db="cbt", bootstrap_db="postgres", raise_on_failure=True)
    assert result is True

    # Run a second time to ensure idempotence
    result_repeat = bootstrap_postgres_database(target_db="cbt", bootstrap_db="postgres", raise_on_failure=True)
    assert result_repeat is True
