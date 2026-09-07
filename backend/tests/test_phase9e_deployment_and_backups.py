import os
import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from backend.app.core.config import Settings, settings
from backend.app.core.database import engine
from scripts.backup_db import backup_database
from scripts.restore_test import run_restore_test
from scripts.system_monitor import check_disk, check_backup_freshness, check_database


def test_database_connection_pooling_settings():
    """Verify SQLAlchemy engine connection pooling configuration."""
    assert settings.DB_POOL_SIZE >= 10
    assert settings.DB_MAX_OVERFLOW >= 20
    assert settings.DB_POOL_TIMEOUT >= 10
    assert settings.DB_POOL_RECYCLE >= 300
    assert settings.DB_POOL_PRE_PING is True

    pool = engine.pool
    assert pool.size() == settings.DB_POOL_SIZE
    assert pool._max_overflow == settings.DB_MAX_OVERFLOW
    assert pool._timeout == settings.DB_POOL_TIMEOUT
    assert pool._recycle == settings.DB_POOL_RECYCLE
    assert pool._pre_ping is True


def test_production_settings_validation():
    """Verify production environment settings safety."""
    prod_settings = Settings(
        APP_ENV="production",
        DATABASE_URL="postgresql+psycopg://user:pass@127.0.0.1:5432/cbt_prod",
        SECRET_KEY="production_long_cryptographic_secret_key_123456789",
        CORS_ORIGINS="https://cbt.example.com,https://admin.example.com",
    )
    assert prod_settings.is_production is True
    assert prod_settings.session_cookie_secure is True
    assert prod_settings.cors_origins_list == [
        "https://cbt.example.com",
        "https://admin.example.com",
    ]


def test_health_endpoints_liveness_and_readiness(client: TestClient):
    """Verify /health and /health/ready endpoints return 200 OK and database: healthy."""
    res_live = client.get("/health")
    assert res_live.status_code == 200
    data_live = res_live.json()
    assert data_live["status"] in ("ok", "degraded")

    res_ready = client.get("/health/ready")
    assert res_ready.status_code == 200
    data_ready = res_ready.json()
    assert data_ready["status"] == "ok"
    assert data_ready["database"] == "healthy"


def test_backup_script_creates_valid_dump():
    """Verify scripts/backup_db.py generates an actual non-empty .dump artifact."""
    dump_path = backup_database()
    assert dump_path is not False
    assert os.path.exists(dump_path)
    assert os.path.getsize(dump_path) > 0
    assert dump_path.endswith(".dump")


def test_restore_verification_pipeline():
    """Verify scripts/restore_test.py restores into temporary database, verifies tables and cleans up."""
    success = run_restore_test()
    assert success is True


def test_system_monitor_metrics():
    """Verify system monitor checks execute without throwing uncaught exceptions."""
    disk_ok, used_pct = check_disk(str(Path.cwd().drive or "/"))
    assert isinstance(disk_ok, bool)
    assert 0 <= used_pct <= 100

    backup_dir = Path.cwd() / "backups"
    freshness = check_backup_freshness(backup_dir)
    assert isinstance(freshness, bool)

    db_ok = check_database()
    assert db_ok is True


def test_nginx_config_syntax_and_directives():
    """Verify NGINX configuration has all required production directives."""
    cbt_conf = Path.cwd() / "deployment" / "nginx" / "cbt.conf"
    if not cbt_conf.exists():
        cbt_conf = Path.cwd().parent / "deployment" / "nginx" / "cbt.conf"
    assert cbt_conf.exists()
    content = cbt_conf.read_text(encoding="utf-8")

    assert "client_max_body_size 10M;" in content
    assert "limit_req_zone" in content
    assert "Strict-Transport-Security" in content
    assert "X-Content-Type-Options" in content
    assert "location = /health" in content
    assert "location = /health/ready" in content
    assert "location /api/" in content
    assert "location /_next/static/" in content
    assert "proxy_pass http://nextjs_frontend;" in content
    assert "proxy_pass http://fastapi_backend/" in content


def test_systemd_units_validity():
    """Verify systemd service units have proper restart directives and sandboxing."""
    systemd_dir = Path.cwd() / "deployment" / "systemd"

    backend_unit = (systemd_dir / "cbt-backend.service").read_text(encoding="utf-8")
    assert "Restart=always" in backend_unit
    assert "RestartSec=5s" in backend_unit
    assert "NoNewPrivileges=true" in backend_unit

    frontend_unit = (systemd_dir / "cbt-frontend.service").read_text(encoding="utf-8")
    assert "Restart=always" in frontend_unit
    assert "RestartSec=5s" in frontend_unit
    assert "NODE_ENV=production" in frontend_unit

    backup_unit = (systemd_dir / "cbt-backup.service").read_text(encoding="utf-8")
    assert "backup_db.py" in backup_unit

    backup_timer = (systemd_dir / "cbt-backup.timer").read_text(encoding="utf-8")
    assert "OnCalendar=" in backup_timer
    assert "Persistent=true" in backup_timer


def test_env_and_gitignore_security():
    """Verify that .env is ignored and .env.example contains no real passwords."""
    gitignore = (Path.cwd() / ".gitignore").read_text(encoding="utf-8")
    assert ".env" in gitignore
    assert "backups/" in gitignore
    assert "*.dump" in gitignore

    env_example = (Path.cwd() / ".env.example").read_text(encoding="utf-8")
    assert "STRONG_PRODUCTION_PASSWORD" in env_example
    assert "change_this_to_a_secure_random_string_in_production" in env_example


def test_production_script_present_and_complete():
    """Verify production.sh exists, contains all required subcommands, and wrapper exists."""
    prod_sh = Path.cwd() / "production.sh"
    assert prod_sh.exists()
    content = prod_sh.read_text(encoding="utf-8")
    assert "scripts/production.sh" in content

    canonical_sh = Path.cwd() / "scripts" / "production.sh"
    assert canonical_sh.exists()
    canonical_content = canonical_sh.read_text(encoding="utf-8")
    for cmd in ("start", "stop", "restart", "status", "deploy", "backup", "restore-test", "health", "monitor"):
        assert cmd in canonical_content

    active_sh = Path.cwd() / "active production.sh"
    assert active_sh.exists()


def test_shutdown_and_create_admin_scripts_present():
    """Verify scripts/shutdown.sh and scripts/create-admin.sh exist and contain required safety logic."""
    shutdown_sh = Path.cwd() / "scripts" / "shutdown.sh"
    assert shutdown_sh.exists()
    shutdown_content = shutdown_sh.read_text(encoding="utf-8")
    assert "SIGTERM" in shutdown_content
    assert "UNTOUCHED" in shutdown_content

    create_admin_sh = Path.cwd() / "scripts" / "create-admin.sh"
    assert create_admin_sh.exists()

    create_admin_cli = Path.cwd() / "scripts" / "create_admin_cli.py"
    assert create_admin_cli.exists()
    cli_content = create_admin_cli.read_text(encoding="utf-8")
    assert "hash_password" in cli_content
    assert "already exists" in cli_content


def test_operator_documentation_complete():
    """Verify README.md and VM_COMMANDS.md are present with comprehensive instructions."""
    readme = (Path.cwd() / "README.md").read_text(encoding="utf-8")
    assert "/opt/cbt" in readme
    assert "postgres.database.azure.com" in readme
    assert "production.sh" in readme
    assert "create-admin.sh" in readme

    vm_commands = (Path.cwd() / "VM_COMMANDS.md").read_text(encoding="utf-8")
    assert "cd /opt/cbt" in vm_commands
    assert "./scripts/production.sh start" in vm_commands
    assert "./scripts/shutdown.sh" in vm_commands
    assert "./scripts/create-admin.sh" in vm_commands

