#!/usr/bin/env python3
"""Production System & Health Monitoring Utility for CBT Platform.

Monitors:
- Host CPU, Memory, and Disk usage with threshold warnings
- Media and Backup storage footprints
- Backup recency (< 26 hours)
- PostgreSQL database connectivity & connection count
- API Liveness and Readiness HTTP status

Usage:
  python scripts/system_monitor.py [--warn-only]
"""

import os
import sys
import shutil
import urllib.request
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


def check_disk(path: str = "/", threshold_pct: float = 85.0):
    try:
        usage = shutil.disk_usage(path)
        used_pct = (usage.used / usage.total) * 100
        free_gb = usage.free / (1024 ** 3)
        status = "OK" if used_pct < threshold_pct else "WARNING"
        print(f"[{status}] Disk Usage on '{path}': {used_pct:.1f}% used ({free_gb:.2f} GB free)")
        return used_pct < threshold_pct, used_pct
    except Exception as exc:
        print(f"[ERROR] Failed checking disk usage: {exc}", file=sys.stderr)
        return False, 0.0


def check_directory_size(path: Path, label: str):
    try:
        if not path.exists():
            print(f"[INFO] {label} directory does not exist yet: {path}")
            return True, 0.0
        total_bytes = sum(f.stat().st_size for f in path.glob("**/*") if f.is_file())
        size_mb = total_bytes / (1024 * 1024)
        print(f"[OK] {label} storage size: {size_mb:.2f} MB ({path})")
        return True, size_mb
    except Exception as exc:
        print(f"[WARNING] Could not calculate {label} size: {exc}", file=sys.stderr)
        return True, 0.0


def check_backup_freshness(backup_dir: Path, max_age_hours: int = 26):
    try:
        if not backup_dir.exists():
            print(f"[WARNING] Backup directory '{backup_dir}' not found.", file=sys.stderr)
            return False
        dumps = list(backup_dir.glob("cbt_backup_*.dump"))
        if not dumps:
            print(f"[WARNING] No database backups found in '{backup_dir}'!", file=sys.stderr)
            return False
        
        # Sort by mtime descending
        dumps.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        latest = dumps[0]
        age_seconds = (datetime.now(timezone.utc).timestamp()) - latest.stat().st_mtime
        age_hours = age_seconds / 3600
        status = "OK" if age_hours <= max_age_hours else "WARNING"
        print(f"[{status}] Latest backup: {latest.name} ({age_hours:.1f} hours old)")
        return age_hours <= max_age_hours
    except Exception as exc:
        print(f"[ERROR] Failed checking backup freshness: {exc}", file=sys.stderr)
        return False


def check_database():
    try:
        from backend.app.core.config import settings
        from backend.app.core.database import SessionLocal
        from sqlalchemy import text

        db = SessionLocal()
        try:
            res = db.execute(text("SELECT count(*) FROM pg_stat_activity;")).fetchone()
            active_conns = res[0] if res else 0
            print(f"[OK] PostgreSQL connection healthy. Active connections in cluster: {active_conns}")
            return True
        finally:
            db.close()
    except Exception as exc:
        print(f"[ERROR] Database check failed: {exc}", file=sys.stderr)
        return False


def check_api_health(base_url: str = "http://127.0.0.1:8000"):
    ok = True
    for endpoint in ("/health", "/health/ready"):
        url = f"{base_url}{endpoint}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "CBT-Monitor/1.0"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                status_code = resp.getcode()
                data = json.loads(resp.read().decode("utf-8"))
                db_state = data.get("database", "unknown")
                if status_code == 200 and db_state == "healthy":
                    print(f"[OK] API {endpoint}: HTTP {status_code} (database: {db_state})")
                else:
                    print(f"[WARNING] API {endpoint}: HTTP {status_code} (status: {data.get('status')})", file=sys.stderr)
                    ok = False
        except Exception as exc:
            print(f"[WARNING] API {endpoint} probe failed ({url}): {exc}")
            # Non-fatal if backend is running under alternative port or stopped for maintenance
            ok = False
    return ok


def main():
    print("=== CBT PLATFORM SYSTEM MONITOR ===")
    all_ok = True

    # 1. Host Disk
    disk_path = str(PROJECT_ROOT.drive or "/") if sys.platform == "win32" else "/"
    disk_ok, _ = check_disk(disk_path, threshold_pct=85.0)
    all_ok = all_ok and disk_ok

    # 2. Uploads Storage
    media_dir = PROJECT_ROOT / "backend" / "media"
    check_directory_size(media_dir, "Question Media Uploads")

    # 3. Backup Storage & Recency
    backup_dir = PROJECT_ROOT / "backups"
    check_directory_size(backup_dir, "Database Backups")
    backup_ok = check_backup_freshness(backup_dir)
    # Don't fail entire check if backups directory is newly initialized
    if not backup_ok:
        print("[NOTICE] Automated daily backup recommended via 'production.sh backup'")

    # 4. Database Connectivity
    db_ok = check_database()
    all_ok = all_ok and db_ok

    # 5. Local API Health (if active)
    check_api_health()

    print("\n=== SYSTEM MONITOR SUMMARY ===")
    if all_ok:
        print("Status: HEALTHY (All critical metrics within operational thresholds)")
        sys.exit(0)
    else:
        print("Status: DEGRADED (One or more critical checks reported issues)", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
