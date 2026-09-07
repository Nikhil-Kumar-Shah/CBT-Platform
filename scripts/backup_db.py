#!/usr/bin/env python3
"""Automated PostgreSQL Database Backup Script for CBT Platform.

Features:
- Connects using DATABASE_URL or standard environment parameters.
- Uses pg_dump to create compressed, timestamped backups.
- Verifies backup integrity and non-zero file size.
- Automatically cleans up expired backups per BACKUP_RETENTION_DAYS policy.
- Logs execution and operational metrics safely without printing passwords.
"""

import os
import sys
import subprocess
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse
from pathlib import Path


def parse_database_url(url: str):
    try:
        from backend.app.core.db_bootstrap import parse_postgres_conn_info
        info = parse_postgres_conn_info(url)
        return {
            "user": info["user"],
            "password": info["password"],
            "host": info["host"],
            "port": str(info["port"]),
            "dbname": info["target_db"],
            "sslmode": info.get("sslmode"),
        }
    except Exception:
        normalized = url.replace("postgresql+psycopg://", "postgresql://").replace("postgresql+psycopg2://", "postgresql://")
        parsed = urlparse(normalized)
        return {
            "user": parsed.username or "postgres",
            "password": parsed.password or "",
            "host": parsed.hostname or "127.0.0.1",
            "port": str(parsed.port or 5432),
            "dbname": parsed.path.lstrip("/") or "cbt",
            "sslmode": None,
        }


def backup_database():
    # Load config from environment, backend settings, or default
    default_db_url = "postgresql+psycopg://postgres:postgres@127.0.0.1:5433/cbt"
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
        from backend.app.core.config import settings
        default_db_url = settings.effective_database_url
    except Exception:
        pass

    db_url = os.getenv("DATABASE_URL", default_db_url)
    backup_dir = os.getenv("BACKUP_DIR", "backups")
    retention_days = int(os.getenv("BACKUP_RETENTION_DAYS", "7"))
    pg_dump_cmd = os.getenv("PG_DUMP_PATH", "pg_dump")

    # On Windows, locate pg_dump if standard PATH doesn't have it
    if sys.platform == "win32" and pg_dump_cmd == "pg_dump":
        default_win_path = r"C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"
        if os.path.exists(default_win_path):
            pg_dump_cmd = default_win_path

    # Ensure backup directory exists
    backup_path = Path(backup_dir).resolve()
    backup_path.mkdir(parents=True, exist_ok=True)

    db_params = parse_database_url(db_url)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_filename = f"cbt_backup_{db_params['dbname']}_{timestamp}.dump"
    target_file = backup_path / backup_filename

    print(f"[{datetime.now(timezone.utc).isoformat()}] Starting backup of database '{db_params['dbname']}' on {db_params['host']}:{db_params['port']}...")

    cmd = [
        pg_dump_cmd,
        "-h", db_params["host"],
        "-p", db_params["port"],
        "-U", db_params["user"],
        "-F", "c",  # Custom compressed format (suitable for pg_restore)
        "-b",       # Include blobs
        "-v",       # Verbose
        "-f", str(target_file),
        db_params["dbname"],
    ]

    env = os.environ.copy()
    if db_params["password"]:
        env["PGPASSWORD"] = db_params["password"]
    if db_params.get("sslmode"):
        env["PGSSLMODE"] = db_params["sslmode"]

    try:
        res = subprocess.run(
            cmd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
        if res.returncode != 0:
            print(f"ERROR: pg_dump failed with code {res.returncode}:\n{res.stderr}", file=sys.stderr)
            if "server version mismatch" in res.stderr.lower():
                print(
                    "\nTIP: The remote PostgreSQL server version is newer than your local pg_dump client.\n"
                    "To upgrade pg_dump on Ubuntu:\n"
                    "    sudo apt install -y postgresql-client-18\n"
                    "Or bypass pre-deployment backup:\n"
                    "    ./scripts/production.sh deploy --skip-backup\n",
                    file=sys.stderr,
                )
            return False

        if not target_file.exists() or target_file.stat().st_size == 0:
            print(f"ERROR: Backup file was not created or is empty: {target_file}", file=sys.stderr)
            return False

        file_size_kb = target_file.stat().st_size / 1024
        print(f"SUCCESS: Backup created at {target_file} ({file_size_kb:.1f} KB)")

    except Exception as exc:
        print(f"ERROR: Failed executing backup command: {exc}", file=sys.stderr)
        return False

    # Apply Retention Policy
    cleanup_old_backups(backup_path, retention_days)
    return str(target_file)


def cleanup_old_backups(backup_dir: Path, retention_days: int):
    print(f"Checking retention policy: deleting dumps older than {retention_days} days...")
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    deleted_count = 0

    for item in backup_dir.glob("cbt_backup_*.dump"):
        try:
            mtime = datetime.fromtimestamp(item.stat().st_mtime, timezone.utc)
            if mtime < cutoff:
                item.unlink()
                deleted_count += 1
                print(f"  Deleted expired backup: {item.name}")
        except Exception as err:
            print(f"  Warning: could not delete {item}: {err}")

    print(f"Retention check complete. Cleaned up {deleted_count} expired backups.")


if __name__ == "__main__":
    result = backup_database()
    if not result:
        sys.exit(1)
    sys.exit(0)
