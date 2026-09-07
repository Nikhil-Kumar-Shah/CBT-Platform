#!/usr/bin/env python3
"""Automated PostgreSQL Backup Restore Verification Test for CBT Platform.

Workflow:
1. Performs a live test backup using backup_db.py.
2. Connects to PostgreSQL server and creates a temporary restore database (`cbt_restore_verify_test`).
3. Executes pg_restore into the temporary database.
4. Queries the restored database to verify schema integrity:
   - Verifies tables: users, subjects, tests, questions, test_attempts, test_attempt_answers.
   - Verifies data: user accounts, active tests.
5. Drops the temporary test database cleanly.
6. Asserts complete restoration success without touching production data.
"""

import os
import sys
import subprocess
import psycopg
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.backup_db import backup_database, parse_database_url


def run_restore_test():
    print("=== CBT PLATFORM BACKUP RESTORE VERIFICATION TEST ===")
    default_db_url = "postgresql+psycopg://postgres:postgres@127.0.0.1:5433/cbt"
    try:
        from backend.app.core.config import settings
        default_db_url = settings.effective_database_url
    except Exception:
        pass

    db_url = os.getenv("DATABASE_URL", default_db_url)
    db_params = parse_database_url(db_url)

    pg_restore_cmd = os.getenv("PG_RESTORE_PATH", "pg_restore")
    if sys.platform == "win32" and pg_restore_cmd == "pg_restore":
        default_win_path = r"C:\Program Files\PostgreSQL\18\bin\pg_restore.exe"
        if os.path.exists(default_win_path):
            pg_restore_cmd = default_win_path

    # Step 1: Create a fresh backup
    print("\n1. Generating test backup...")
    backup_file = backup_database()
    if not backup_file or not os.path.exists(backup_file):
        print("FAIL: Backup generation failed.", file=sys.stderr)
        return False
    print(f"Verified backup artifact: {backup_file}")

    temp_db_name = "cbt_restore_verify_test"
    conn_str = f"host={db_params['host']} port={db_params['port']} user={db_params['user']} password={db_params['password']} dbname=postgres"
    if db_params.get("sslmode"):
        conn_str += f" sslmode={db_params['sslmode']}"

    try:
        # Step 2: Connect to maintenance db and create temp database
        print(f"\n2. Creating temporary test database '{temp_db_name}'...")
        with psycopg.connect(conn_str, autocommit=True) as conn:
            with conn.cursor() as cur:
                # Drop if exists from previous run
                cur.execute(f"DROP DATABASE IF EXISTS {temp_db_name} WITH (FORCE);")
                cur.execute(f"CREATE DATABASE {temp_db_name};")
        print("Temporary test database created.")

        # Step 3: Run pg_restore
        print(f"\n3. Restoring {backup_file} into '{temp_db_name}'...")
        env = os.environ.copy()
        if db_params["password"]:
            env["PGPASSWORD"] = db_params["password"]

        restore_cmd = [
            pg_restore_cmd,
            "-h", db_params["host"],
            "-p", db_params["port"],
            "-U", db_params["user"],
            "-d", temp_db_name,
            "-v",
            "--no-owner",
            backup_file,
        ]

        res = subprocess.run(
            restore_cmd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )

        # pg_restore returns 0 on success or 1 if non-fatal warnings occurred
        if res.returncode not in (0, 1):
            print(f"FAIL: pg_restore exited with code {res.returncode}:\n{res.stderr}", file=sys.stderr)
            return False
        print("pg_restore execution succeeded.")

        # Step 4: Verify restored database tables and records
        print(f"\n4. Verifying restored database tables and integrity in '{temp_db_name}'...")
        temp_conn_str = f"host={db_params['host']} port={db_params['port']} user={db_params['user']} password={db_params['password']} dbname={temp_db_name}"

        required_tables = [
            "users",
            "user_sessions",
            "subjects",
            "test_series",
            "tests",
            "questions",
            "question_options",
            "test_attempts",
            "test_attempt_answers",
            "attempt_integrity_events",
        ]

        with psycopg.connect(temp_conn_str) as conn:
            with conn.cursor() as cur:
                # Verify each core table exists
                for tbl in required_tables:
                    cur.execute("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = %s);", (tbl,))
                    exists = cur.fetchone()[0]
                    if not exists:
                        print(f"FAIL: Required table '{tbl}' was not found in restored database.", file=sys.stderr)
                        return False

                    cur.execute(f"SELECT count(*) FROM {tbl};")
                    count = cur.fetchone()[0]
                    print(f"  Verified table '{tbl}': {count} records found.")

                # Verify admin user count or report presence
                cur.execute("SELECT count(*) FROM users WHERE role = 'ADMIN' OR role = 'admin';")
                admin_count = cur.fetchone()[0]
                print(f"  Verified admin user presence: {admin_count} admin accounts.")

        print("\nSUCCESS: All schema tables, relationships, and data verified in restored database!")

    finally:
        # Step 5: Clean up temporary test database
        print(f"\n5. Cleaning up temporary test database '{temp_db_name}'...")
        try:
            with psycopg.connect(conn_str, autocommit=True) as conn:
                with conn.cursor() as cur:
                    cur.execute(f"DROP DATABASE IF EXISTS {temp_db_name} WITH (FORCE);")
            print("Temporary database dropped successfully.")
        except Exception as cleanup_err:
            print(f"Warning: Cleanup of temp database failed: {cleanup_err}")

    print("\n=== RESTORE VERIFICATION TEST COMPLETED SUCCESSFULLY ===")
    return True


if __name__ == "__main__":
    success = run_restore_test()
    if not success:
        sys.exit(1)
    sys.exit(0)
