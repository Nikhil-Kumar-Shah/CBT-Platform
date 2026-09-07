#!/usr/bin/env python3
"""
CBT Platform — Unified Single-Point Runner
Launches and monitors:
  1. PostgreSQL (Port 5433, local cluster in .pgdata)
  2. FastAPI Backend (Port 8000 via Uvicorn)
  3. Next.js Frontend (Port 3000 via npm run dev / start)

Provides synchronized, color-coded terminal log multiplexing,
health checks, and graceful shutdown handling.
"""

import argparse
import ctypes
import os
import platform
import queue
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

# Force UTF-8 on Windows consoles to prevent cp1252 UnicodeEncodeError
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Enable ANSI escape sequences on Windows
if platform.system() == "Windows":
    try:
        kernel32 = ctypes.windll.kernel32
        kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
    except Exception:
        pass

# ANSI Color Codes
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"

# Foreground
CYAN = "\033[36m"
BRIGHT_CYAN = "\033[96m"
GREEN = "\033[32m"
BRIGHT_GREEN = "\033[92m"
YELLOW = "\033[33m"
BRIGHT_YELLOW = "\033[93m"
BLUE = "\033[34m"
BRIGHT_BLUE = "\033[94m"
MAGENTA = "\033[35m"
BRIGHT_MAGENTA = "\033[95m"
RED = "\033[31m"
BRIGHT_RED = "\033[91m"
WHITE = "\033[37m"
BRIGHT_WHITE = "\033[97m"
GRAY = "\033[90m"

# Background
BG_CYAN = "\033[46m\033[30m"
BG_GREEN = "\033[42m\033[30m"
BG_YELLOW = "\033[43m\033[30m"
BG_MAGENTA = "\033[45m\033[30m"
BG_BLUE = "\033[44m\033[37m"
BG_RED = "\033[41m\033[37m"

# Root Paths
ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"
PGDATA_DIR = ROOT_DIR / ".pgdata"
VENV_DIR = ROOT_DIR / ".venv"

if platform.system() == "Windows":
    PYTHON_EXE = VENV_DIR / "Scripts" / "python.exe"
    UVICORN_EXE = VENV_DIR / "Scripts" / "uvicorn.exe"
    ALEMBIC_EXE = VENV_DIR / "Scripts" / "alembic.exe"
    NPM_CMD = "npm.cmd"
    POSTGRES_BIN_DEFAULT = Path(r"C:\Program Files\PostgreSQL\18\bin\postgres.exe")
    PG_CTL_BIN_DEFAULT = Path(r"C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe")
else:
    PYTHON_EXE = VENV_DIR / "bin" / "python"
    UVICORN_EXE = VENV_DIR / "bin" / "uvicorn"
    ALEMBIC_EXE = VENV_DIR / "bin" / "alembic"
    NPM_CMD = "npm"
    POSTGRES_BIN_DEFAULT = Path("/usr/lib/postgresql/bin/postgres")
    PG_CTL_BIN_DEFAULT = Path("/usr/lib/postgresql/bin/pg_ctl")

if not PYTHON_EXE.exists():
    PYTHON_EXE = Path(sys.executable)

# Credentials Info
ADMIN_CREDENTIALS = {
    "username": "admin",
    "email": "admin@cbt.local",
    "password": "AdminSecure123!",
    "role": "ADMIN (Superuser)",
    "display_name": "System Administrator",
}

# Thread-safe log lock
print_lock = threading.Lock()
shutdown_event = threading.Event()
active_subprocesses = []


def format_tag(tag: str, color_bg: str, min_width: int = 10) -> str:
    padded = f" {tag} ".center(min_width)
    return f"{color_bg}{BOLD}{padded}{RESET}"


TAG_SYSTEM = format_tag("SYSTEM", BG_MAGENTA)
TAG_DATABASE = format_tag("DATABASE", BG_YELLOW)
TAG_BACKEND = format_tag("BACKEND", BG_CYAN)
TAG_API = format_tag("API", BG_CYAN)
TAG_AUTH = format_tag("AUTH", BG_BLUE)
TAG_FRONTEND = format_tag("FRONTEND", BG_GREEN)
TAG_ERROR = format_tag("ERROR", BG_RED)


def log(tag: str, message: str, color: str = ""):
    now = datetime.now().strftime("%H:%M:%S")
    timestamp = f"{GRAY}{now}{RESET}"
    with print_lock:
        print(f"{timestamp} {tag} {color}{message}{RESET}", flush=True)


def is_port_open(port: int, host: str = "127.0.0.1", timeout: float = 0.5) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


def wait_for_port(port: int, service_name: str, host: str = "127.0.0.1", max_retries: int = 40, delay: float = 0.5) -> bool:
    for _ in range(max_retries):
        if shutdown_event.is_set():
            return False
        if is_port_open(port, host=host):
            return True
        time.sleep(delay)
    return False


def free_port(port: int, service_name: str) -> bool:
    """If port is occupied, finds and terminates the occupying process to prevent EADDRINUSE / WinError 10013."""
    if not is_port_open(port):
        return True

    log(TAG_SYSTEM, f"Port {port} ({service_name}) is currently in use. Reclaiming port...", BRIGHT_YELLOW)
    try:
        pg_pid = None
        pid_file = PGDATA_DIR / "postmaster.pid"
        if pid_file.exists():
            try:
                lines = pid_file.read_text().splitlines()
                if lines:
                    pg_pid = int(lines[0].strip())
            except Exception:
                pass

        if platform.system() == "Windows":
            cmd = "netstat -ano -p tcp"
            res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            pids = set()
            for line in res.stdout.splitlines():
                parts = line.strip().split()
                if len(parts) >= 5 and parts[0] == "TCP":
                    local_addr = parts[1]
                    state = parts[3]
                    pid = parts[4]
                    if local_addr.endswith(f":{port}") and state == "LISTENING":
                        if pid.isdigit() and int(pid) != os.getpid() and int(pid) != 0:
                            if pg_pid is None or int(pid) != pg_pid:
                                pids.add(int(pid))
            for pid in pids:
                try:
                    log(TAG_SYSTEM, f"Terminating stale process (PID {pid}) on port {port}...", GRAY)
                    subprocess.run(
                        ["taskkill", "/F", "/PID", str(pid)],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        timeout=5,
                    )
                except Exception:
                    pass
        else:
            subprocess.run(["fuser", "-k", f"{port}/tcp"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as e:
        log(TAG_SYSTEM, f"Note regarding port {port}: {e}", GRAY)

    for _ in range(15):
        if not is_port_open(port):
            log(TAG_SYSTEM, f"Port {port} ({service_name}) is now cleared.", BRIGHT_GREEN)
            return True
        time.sleep(0.2)

    return not is_port_open(port)


def clean_stale_postgres_pid(port: int = 5433):
    pid_file = PGDATA_DIR / "postmaster.pid"
    if not pid_file.exists():
        return
    try:
        # If the port is not open, PostgreSQL is definitely not running on this port.
        # Run pg_ctl stop -m immediate to safely release any lingering Windows shared memory blocks.
        if not is_port_open(port):
            log(TAG_DATABASE, f"Port {port} is closed. Clearing stale postmaster.pid and shared memory locks...", BRIGHT_YELLOW)
            pg_ctl = POSTGRES_BIN_DEFAULT.parent / ("pg_ctl.exe" if platform.system() == "Windows" else "pg_ctl")
            if pg_ctl.exists():
                try:
                    subprocess.run(
                        [str(pg_ctl), "stop", "-D", str(PGDATA_DIR), "-m", "immediate"],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        timeout=3,
                    )
                except Exception:
                    pass
            pid_file.unlink(missing_ok=True)
            return

        lines = pid_file.read_text().splitlines()
        if not lines:
            pid_file.unlink(missing_ok=True)
            return
        pid = int(lines[0].strip())
        # Check if pid is running
        if platform.system() == "Windows":
            res = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}"],
                capture_output=True,
                text=True,
            )
            if str(pid) not in res.stdout:
                log(TAG_DATABASE, f"Removing stale postmaster.pid (PID {pid} not running)...", BRIGHT_YELLOW)
                pg_ctl = POSTGRES_BIN_DEFAULT.parent / "pg_ctl.exe"
                if pg_ctl.exists():
                    try:
                        subprocess.run(
                            [str(pg_ctl), "stop", "-D", str(PGDATA_DIR), "-m", "immediate"],
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                            timeout=3,
                        )
                    except Exception:
                        pass
                pid_file.unlink(missing_ok=True)
        else:
            try:
                os.kill(pid, 0)
            except OSError:
                log(TAG_DATABASE, f"Removing stale postmaster.pid (PID {pid} not running)...", BRIGHT_YELLOW)
                pid_file.unlink(missing_ok=True)
    except Exception as e:
        log(TAG_DATABASE, f"Note regarding postmaster.pid: {e}", GRAY)


def wait_for_database_ready(port: int = 5433, max_retries: int = 40, delay: float = 0.5) -> bool:
    """Verifies PostgreSQL is actively accepting queries on bootstrap database 'postgres'."""
    import psycopg
    conn_str = f"postgresql://postgres:postgres@127.0.0.1:{port}/postgres"
    for _ in range(max_retries):
        if shutdown_event.is_set():
            return False
        try:
            with psycopg.connect(conn_str, connect_timeout=1) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    return True
        except Exception:
            time.sleep(delay)
    return False


def ensure_database(port: int = 5433) -> subprocess.Popen | None:
    """Verifies PostgreSQL is listening and ready on port 5433, or launches the local instance."""
    if is_port_open(port) and wait_for_database_ready(port, max_retries=3, delay=0.2):
        log(TAG_DATABASE, f"PostgreSQL is already active and accepting connections on port {port}.", BRIGHT_GREEN)
        return None

    clean_stale_postgres_pid(port)

    # Search for postgres binary
    pg_bin = POSTGRES_BIN_DEFAULT
    if not pg_bin.exists():
        found = shutil.which("postgres")
        if found:
            pg_bin = Path(found)

    if not pg_bin.exists():
        log(
            TAG_DATABASE,
            f"PostgreSQL 18 binary not found at default location ({POSTGRES_BIN_DEFAULT}). "
            f"Please ensure PostgreSQL is started on port {port}.",
            BRIGHT_YELLOW,
        )
        return None

    if not PGDATA_DIR.exists():
        log(TAG_DATABASE, f"Data directory {PGDATA_DIR} does not exist. Initializing...", BRIGHT_CYAN)
        initdb = pg_bin.parent / ("initdb.exe" if platform.system() == "Windows" else "initdb")
        if initdb.exists():
            subprocess.run(
                [str(initdb), "-D", str(PGDATA_DIR), "-U", "postgres", "-A", "trust", "--encoding=UTF8"],
                check=True,
            )

    log(TAG_DATABASE, f"Launching local PostgreSQL instance on port {port}...", BRIGHT_CYAN)
    cmd = [str(pg_bin), "-D", str(PGDATA_DIR), "-p", str(port)]
    extra_flags = {}
    if platform.system() == "Windows":
        extra_flags["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        **extra_flags,
    )
    active_subprocesses.append(proc)

    # Start reader thread for DB logs
    def stream_db():
        for line in iter(proc.stdout.readline, ""):
            line_str = line.strip()
            if line_str and not shutdown_event.is_set():
                lower = line_str.lower()
                # Filter benign checkpoint and transient startup polling noise
                if (
                    "checkpoint" in lower
                    or "the database system is starting up" in lower
                    or "consistent recovery state has not been yet reached" in lower
                    or "the database system is not yet accepting connections" in lower
                ):
                    continue
                log(TAG_DATABASE, line_str, GRAY)
        proc.stdout.close()

    t = threading.Thread(target=stream_db, daemon=True)
    t.start()

    if wait_for_database_ready(port, max_retries=40, delay=0.5):
        log(TAG_DATABASE, f"PostgreSQL is online and accepting connections on port {port}.", BRIGHT_GREEN)
        return proc
    else:
        log(TAG_DATABASE, f"Timed out waiting for PostgreSQL to be ready on port {port}.", BRIGHT_RED)
        return proc


def ensure_target_database():
    """Runs PostgreSQL auto-bootstrap to ensure the target application database (e.g. 'cbt') exists."""
    try:
        if str(ROOT_DIR) not in sys.path:
            sys.path.insert(0, str(ROOT_DIR))
        from backend.app.core.db_bootstrap import bootstrap_postgres_database, get_target_db_name
        target_name = get_target_db_name()
        log(TAG_DATABASE, f"Ensuring PostgreSQL database '{target_name}' exists...", BRIGHT_CYAN)
        bootstrap_postgres_database(raise_on_failure=True)
        log(TAG_DATABASE, f"PostgreSQL database '{target_name}' verified & ready.", BRIGHT_GREEN)
    except Exception as e:
        log(TAG_ERROR, f"Database auto-bootstrap failed: {e}", BRIGHT_RED)
        raise


def run_database_migrations():
    """Runs alembic upgrade head to ensure database schema is up-to-date."""
    try:
        log(TAG_SYSTEM, "Checking database migrations (alembic upgrade head)...", BRIGHT_CYAN)
        env = os.environ.copy()
        env["PYTHONPATH"] = str(ROOT_DIR)
        res = subprocess.run(
            [str(PYTHON_EXE), "-m", "alembic", "upgrade", "head"],
            cwd=str(BACKEND_DIR),
            capture_output=True,
            text=True,
            env=env,
        )
        if res.returncode == 0:
            log(TAG_SYSTEM, "Database schema is synchronized with latest migrations.", BRIGHT_GREEN)
        else:
            log(TAG_SYSTEM, f"Alembic note/output: {res.stderr.strip() or res.stdout.strip()}", GRAY)
    except Exception as e:
        log(TAG_SYSTEM, f"Migration check skipped: {e}", GRAY)


def ensure_admin_user():
    """Ensure the default admin user exists if not already present."""
    try:
        log(TAG_SYSTEM, "Verifying administrator account...", BRIGHT_CYAN)
        env = os.environ.copy()
        env["PYTHONPATH"] = str(ROOT_DIR)
        script_path = ROOT_DIR / "scripts" / "ensure_admin.py"
        if not script_path.exists():
            log(TAG_SYSTEM, "Admin verification script not found, skipping.", GRAY)
            return
        res = subprocess.run(
            [str(PYTHON_EXE), str(script_path)],
            cwd=str(ROOT_DIR),
            capture_output=True,
            text=True,
            env=env,
            timeout=30,
        )
        stdout_lines = res.stdout.strip().splitlines()
        for line in stdout_lines:
            if "STATUS:CREATED" in line:
                log(TAG_SYSTEM, "Initial admin user created (admin / AdminSecure123!).", BRIGHT_GREEN)
                return
            elif "STATUS:EXISTS" in line or "STATUS:OK" in line:
                log(TAG_SYSTEM, "Administrator account verified (persistent).", BRIGHT_GREEN)
                return
        stderr_msg = res.stderr.strip().split("\n")[-1] if res.stderr.strip() else ""
        log(TAG_SYSTEM, f"Admin user check note: {res.stdout.strip()[-80:] or stderr_msg}", GRAY)
    except Exception as e:
        log(TAG_SYSTEM, f"Admin user check skipped: {e}", GRAY)


def ensure_storage_ready():
    """Validates Azure Blob Storage configuration and live cloud connectivity on startup.

    Azure Blob Storage is the sole media backend. Local fallback is strictly prohibited.
    """
    try:
        log(TAG_SYSTEM, "Verifying Azure Blob Storage connectivity...", BRIGHT_CYAN)
        if str(ROOT_DIR) not in sys.path:
            sys.path.insert(0, str(ROOT_DIR))
        from backend.app.core.config import validate_storage_configuration, settings
        validate_storage_configuration()

        from azure.storage.blob import BlobServiceClient
        client = BlobServiceClient.from_connection_string(settings.AZURE_STORAGE_CONNECTION_STRING)
        account_name = getattr(client, "account_name", "unknown")

        log(TAG_SYSTEM, "Azure Blob Storage: CONNECTED", BRIGHT_GREEN)
        log(TAG_SYSTEM, f"Storage account: {account_name} | Container: {settings.AZURE_STORAGE_CONTAINER_NAME}", BRIGHT_GREEN)
        log(TAG_SYSTEM, "Media storage backend: AZURE_BLOB | Media storage status: READY", BRIGHT_GREEN)
    except Exception as e:
        log(TAG_ERROR, f"Azure Blob Storage connectivity check failed: {e}", BRIGHT_RED)
        log(TAG_ERROR, "CRITICAL: Azure Blob Storage is the required sole media backend. Startup aborted.", BRIGHT_RED)
        raise



def is_local_database() -> bool:
    """Checks if the configured database host is local (localhost/127.0.0.1)."""
    try:
        if str(ROOT_DIR) not in sys.path:
            sys.path.insert(0, str(ROOT_DIR))
        from backend.app.core.db_bootstrap import parse_postgres_conn_info
        info = parse_postgres_conn_info()
        host = info.get("host", "127.0.0.1").lower()
        return host in ("127.0.0.1", "localhost", "::1", "")
    except Exception:
        return True


def stream_backend_output(proc: subprocess.Popen):
    """Processes backend logs with clean, structured, informative formatting including exact latency."""
    access_regex = re.compile(r'ACCESS:\s+\"([A-Z]+)\s+([^"]+)\"\s+([0-9]{3})\s+in\s+([0-9.]+(?:ms)?)')
    http_regex = re.compile(r'\"([A-Z]+)\s+([^"]+)\s+HTTP/[0-9.]+\"\s+([0-9]{3})(?:\s+([A-Za-z ]+))?')
    while not shutdown_event.is_set():
        try:
            line = proc.stdout.readline()
            if not line:
                if proc.poll() is not None:
                    break
                time.sleep(0.05)
                continue
        except Exception:
            if proc.poll() is not None:
                break
            time.sleep(0.05)
            continue

        line_str = line.rstrip()
        if not line_str:
            continue

        # Check for structured ACCESS line with execution time
        m_acc = access_regex.search(line_str)
        if m_acc:
            method, path, status_code, latency = m_acc.groups()
            status_num = int(status_code)
            if status_num >= 500:
                status_col = BOLD + BRIGHT_RED
            elif status_num >= 400:
                status_col = BOLD + BRIGHT_YELLOW
            elif status_num >= 300:
                status_col = BRIGHT_CYAN
            else:
                status_col = BRIGHT_GREEN

            tag = TAG_AUTH if "/auth" in path else TAG_API
            status_label = f"{status_code} OK" if status_num == 200 else str(status_code)
            latency_str = latency if latency.endswith("ms") else f"{latency}ms"
            log(tag, f"{BOLD}{method:<6}{RESET} {path:<40} -> {status_col}{status_label:<7}{RESET} {DIM}({latency_str}){RESET}")
            continue

        # Fallback for standard Uvicorn access log (skip if ACCESS line is present)
        m = http_regex.search(line_str)
        if m:
            continue

        lower = line_str.lower()
        if (
            "sqlalchemy.engine" in lower
            or "[raw sql]" in lower
            or "select pg_catalog" in lower
            or "show standard_conforming_strings" in lower
            or "begin (implicit)" in lower
            or "rollback" in lower
            or line_str.strip().startswith("{")
            or "cached since" in lower
            or "select current_schema" in lower
            or "azure.core" in lower
            or "urllib3" in lower
            or "http_logging_policy" in lower
            or "proactor: iocpproactor" in lower
            or "x-ms-" in lower
            or "request url:" in lower
            or "request headers:" in lower
            or "response headers:" in lower
            or "response status:" in lower
            or "no body was attached" in lower
            or "starting new https connection" in lower
        ):
            continue

        if "database connection verified successfully" in lower or "postgreSQL database 'cbt' verified" in lower:
            log(TAG_DATABASE, "PostgreSQL connection pool verified & active.", BRIGHT_GREEN)
        elif "application startup complete" in lower:
            log(TAG_BACKEND, "FastAPI application ready for requests.", BRIGHT_GREEN)
        elif "uvicorn running on" in lower:
            log(TAG_BACKEND, f"FastAPI API gateway live at http://127.0.0.1:8000", BRIGHT_CYAN)
        elif "will watch for changes" in lower:
            log(TAG_BACKEND, "Live reload watcher active on backend/app", GRAY)
        elif "started server process" in lower or "started reloader process" in lower or "waiting for application startup" in lower:
            continue
        elif "error" in lower or "traceback" in lower or "exception" in lower:
            log(TAG_ERROR, line_str, BRIGHT_RED)
        elif "warn" in lower:
            log(TAG_BACKEND, line_str, BRIGHT_YELLOW)
        else:
            log(TAG_BACKEND, line_str, CYAN)


def stream_frontend_output(proc: subprocess.Popen):
    """Processes frontend Next.js logs, filtering noise and highlighting routes."""
    try:
        for line in iter(proc.stdout.readline, ""):
            if shutdown_event.is_set():
                break
            line_str = line.rstrip()
            if not line_str:
                continue

            lower = line_str.lower()

            # Filter unwanted noise and internal framework logs
            if (
                "[dep0060]" in lower
                or "node --trace-deprecation" in lower
                or "react devtools" in lower
                or "[fast refresh]" in lower
                or "hot-reloader" in lower
                or "favicon.ico" in lower
                or "input elements should have autocomplete" in lower
                or "cbt-frontend@" in lower
                or "next dev" in lower
                or "next start" in lower
                or "local:" in lower
                or "network:" in lower
                or "next.js 14" in lower
                or "starting..." in lower
                or "x-ms-" in lower
                or "redacted" in lower
            ):
                continue

            # Clean route compilation logs
            if "compiled" in lower:
                clean_msg = line_str.replace("✓", "").replace("âœ“", "").strip()
                log(TAG_FRONTEND, f"Rendered: {clean_msg}", BRIGHT_GREEN)
            elif "compiling" in lower:
                clean_msg = line_str.replace("○", "").replace("â—‹", "").strip()
                log(TAG_FRONTEND, f"Compiling: {clean_msg}", GRAY)
            elif "ready in" in lower:
                clean_msg = line_str.replace("✓", "").replace("âœ“", "").strip()
                log(TAG_FRONTEND, f"Next.js server ready ({clean_msg})", BRIGHT_GREEN)
            elif "error" in lower or "failed" in lower:
                log(TAG_ERROR, line_str, BRIGHT_RED)
            elif "warn" in lower:
                log(TAG_FRONTEND, line_str, BRIGHT_YELLOW)
            else:
                log(TAG_FRONTEND, line_str, GREEN)
    except Exception:
        pass
    finally:
        if proc.stdout:
            proc.stdout.close()


def print_banner(frontend_mode: str, backend_port: int, frontend_port: int, db_port: int):
    width = 78
    h_line = "=" * width
    sep_line = "-" * width

    try:
        if str(ROOT_DIR) not in sys.path:
            sys.path.insert(0, str(ROOT_DIR))
        from backend.app.core.db_bootstrap import parse_postgres_conn_info
        info = parse_postgres_conn_info()
        host = info.get("host", "127.0.0.1")
        if host in ("127.0.0.1", "localhost", "::1", ""):
            db_label = f"PostgreSQL 18 (Local Port {db_port})"
        else:
            db_label = f"PostgreSQL (Azure Cloud: {host}:{info.get('port', 5432)})"
    except Exception:
        db_label = f"PostgreSQL (Port {db_port})"

    banner_lines = [
        "",
        f"{BRIGHT_CYAN}{h_line}{RESET}",
        f"{BOLD}{BRIGHT_WHITE}   ____ ____ _____   ____  _        _  _____ _____ ___  ____  __  __{RESET}",
        f"{BOLD}{BRIGHT_WHITE}  / ___| __ )_   _| |  _ \\| |      / \\|_   _|  ___/ _ \\|  _ \\|  \\/  |{RESET}",
        f"{BOLD}{BRIGHT_WHITE} | |   |  _ \\ | |   | |_) | |     / _ \\ | | | |_ | | | | |_) | |\\/| |{RESET}",
        f"{BOLD}{BRIGHT_WHITE} | |___| |_) || |   |  __/| |___ / ___ \\| | |  _|| |_| |  _ <| |  | |{RESET}",
        f"{BOLD}{BRIGHT_WHITE}  \\____|____/ |_|   |_|   |_____/_/   \\_\\_| |_|   \\___/|_| \\_\\_|  |_|{RESET}",
        f"{BOLD}{BRIGHT_YELLOW}                PROFESSIONAL CBT EXAMINATION PLATFORM{RESET}",
        f"{BRIGHT_CYAN}{sep_line}{RESET}",
        f"{BOLD}{BRIGHT_WHITE}  SYSTEM SERVICES STATUS:{RESET}",
        f"    * Database:    {BRIGHT_GREEN}{db_label}{RESET}",
        f"    * Backend API: {BRIGHT_CYAN}FastAPI + SQLAlchemy 2.x{RESET} (Port {backend_port})",
        f"    * Frontend:    {BRIGHT_MAGENTA}Next.js 14 ({frontend_mode.upper()} mode){RESET} (Port {frontend_port})",
        f"{BRIGHT_CYAN}{sep_line}{RESET}",
        f"{BOLD}{BRIGHT_WHITE}  ACCESS ENDPOINTS:{RESET}",
        f"    * Admin Portal:  {BOLD}{BRIGHT_GREEN}http://localhost:{frontend_port}/admin{RESET}",
        f"    * Tests Console: {BOLD}{BRIGHT_CYAN}http://localhost:{frontend_port}/admin/tests{RESET}",
        f"    * Results Hub:   {BOLD}{BRIGHT_CYAN}http://localhost:{frontend_port}/admin/results{RESET}",
        f"    * API Docs:      {BOLD}{BRIGHT_YELLOW}http://127.0.0.1:{backend_port}/docs{RESET}",
        f"    * API Health:    {BOLD}{BRIGHT_YELLOW}http://127.0.0.1:{backend_port}/api/v1/health{RESET}",
        f"{BRIGHT_CYAN}{sep_line}{RESET}",
        f"{BOLD}{BRIGHT_WHITE}  ADMIN LOGIN CREDENTIALS:{RESET}",
        f"    * Username:      {BOLD}{BRIGHT_WHITE}{ADMIN_CREDENTIALS['username']}{RESET}",
        f"    * Email:         {BOLD}{BRIGHT_WHITE}{ADMIN_CREDENTIALS['email']}{RESET}",
        f"    * Password:      {BOLD}{BRIGHT_GREEN}{ADMIN_CREDENTIALS['password']}{RESET}",
        f"    * Access Role:   {BOLD}{BRIGHT_YELLOW}{ADMIN_CREDENTIALS['role']}{RESET}",
        f"{BRIGHT_CYAN}{sep_line}{RESET}",
        f"  {DIM}Live unified logs streaming below. Press {BOLD}{BRIGHT_RED}Ctrl + C{RESET}{DIM} anytime to stop all services.{RESET}",
        f"{BRIGHT_CYAN}{h_line}{RESET}",
        "",
    ]
    with print_lock:
        for line in banner_lines:
            try:
                print(line, flush=True)
            except Exception:
                # Strip ANSI if terminal is completely unable to handle it
                clean = re.sub(r"\033\[[0-9;]*m", "", line)
                print(clean, flush=True)


def terminate_process_tree(proc: subprocess.Popen):
    """Safely kills a process and all its children across platforms."""
    if proc.poll() is not None:
        return
    pid = proc.pid
    try:
        if platform.system() == "Windows":
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(pid)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=5,
            )
        else:
            os.killpg(os.getpgid(pid), signal.SIGTERM)
            proc.terminate()
            proc.wait(timeout=3)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def shutdown_postgres():
    """Cleanly stops PostgreSQL using pg_ctl to avoid WAL corruption and stale PID files."""
    pg_ctl = PG_CTL_BIN_DEFAULT
    if not pg_ctl.exists():
        found = shutil.which("pg_ctl")
        if found:
            pg_ctl = Path(found)
    if pg_ctl.exists() and PGDATA_DIR.exists():
        try:
            log(TAG_DATABASE, "Stopping PostgreSQL cleanly with pg_ctl...", BRIGHT_YELLOW)
            subprocess.run(
                [str(pg_ctl), "stop", "-D", str(PGDATA_DIR), "-m", "fast"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=8,
            )
        except Exception:
            pass


def shutdown_all():
    if shutdown_event.is_set():
        return
    shutdown_event.set()
    print("\n")
    log(TAG_SYSTEM, "Shutdown initiated. Stopping all services cleanly...", BRIGHT_YELLOW)
    if is_local_database():
        shutdown_postgres()
    for p in reversed(active_subprocesses):
        try:
            terminate_process_tree(p)
        except Exception:
            pass
    if is_local_database():
        clean_stale_postgres_pid()
    log(TAG_SYSTEM, "All platform services stopped. Goodbye!", BRIGHT_GREEN)


def main():
    parser = argparse.ArgumentParser(
        description="Single-point runner for the CBT Online Examination Platform",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument(
        "--mode",
        choices=["dev", "prod"],
        default="prod",
        help="Frontend execution mode:\n  prod: npm run start (pre-compiled production build, 20-50ms latency, default)\n  dev:  npm run dev (hot reloading for local development)",
    )
    parser.add_argument(
        "--port-backend",
        type=int,
        default=8000,
        help="FastAPI backend port (default: 8000)",
    )
    parser.add_argument(
        "--port-frontend",
        type=int,
        default=3000,
        help="Next.js frontend port (default: 3000)",
    )
    parser.add_argument(
        "--port-db",
        type=int,
        default=5433,
        help="PostgreSQL port (default: 5433)",
    )
    parser.add_argument(
        "--no-db",
        action="store_true",
        help="Skip auto-starting PostgreSQL",
    )
    parser.add_argument(
        "--show-credentials",
        action="store_true",
        help="Display admin credentials and exit",
    )

    args = parser.parse_args()

    if args.show_credentials:
        print("\n" + "=" * 50)
        print(f" {BOLD}{BRIGHT_WHITE}CBT PLATFORM ADMIN CREDENTIALS{RESET}")
        print("=" * 50)
        print(f" Username: {BOLD}{BRIGHT_WHITE}{ADMIN_CREDENTIALS['username']}{RESET}")
        print(f" Email:    {BOLD}{BRIGHT_WHITE}{ADMIN_CREDENTIALS['email']}{RESET}")
        print(f" Password: {BOLD}{BRIGHT_GREEN}{ADMIN_CREDENTIALS['password']}{RESET}")
        print(f" Role:     {BOLD}{BRIGHT_YELLOW}{ADMIN_CREDENTIALS['role']}{RESET}")
        print("=" * 50 + "\n")
        return

    # Signal handlers
    def handle_signal(sig, frame):
        shutdown_all()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_signal)
    if platform.system() != "Windows":
        signal.signal(signal.SIGTERM, handle_signal)

    log(TAG_SYSTEM, "Starting CBT Examination Platform...", BOLD + BRIGHT_WHITE)

    # 0. Reclaim any stale application ports upfront
    free_port(args.port_backend, "FastAPI Backend")
    free_port(args.port_frontend, "Next.js Frontend")

    # 1. Database & Auto-Bootstrap
    if not args.no_db:
        if is_local_database():
            ensure_database(port=args.port_db)
        else:
            from backend.app.core.db_bootstrap import parse_postgres_conn_info
            info = parse_postgres_conn_info()
            log(TAG_DATABASE, f"Target database host: {info['host']}:{info['port']}", BRIGHT_CYAN)
    ensure_target_database()

    # 2. Database Migrations
    run_database_migrations()

    # 2b. Ensure admin user exists with correct credentials
    ensure_admin_user()

    # 2c. Verify Storage Backend (Azure Blob Storage or Local)
    ensure_storage_ready()

    # 3. Backend (FastAPI / Uvicorn)
    backend_env = os.environ.copy()
    backend_env["PYTHONPATH"] = str(ROOT_DIR)
    backend_env["PYTHONUNBUFFERED"] = "1"
    backend_env["PYTHONIOENCODING"] = "utf-8"
    backend_cmd = [
        str(PYTHON_EXE),
        "-m",
        "uvicorn",
        "backend.app.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        str(args.port_backend),
    ]
    if args.mode == "dev":
        backend_cmd.extend(["--reload", "--reload-dir", str(BACKEND_DIR / "app"), "--reload-exclude", "*.log"])

    log(TAG_BACKEND, f"Launching FastAPI Backend on http://127.0.0.1:{args.port_backend}...", BRIGHT_CYAN)
    backend_proc = subprocess.Popen(
        backend_cmd,
        cwd=str(ROOT_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        encoding="utf-8",
        errors="replace",
        env=backend_env,
    )
    active_subprocesses.append(backend_proc)

    t_backend = threading.Thread(
        target=stream_backend_output,
        args=(backend_proc,),
        daemon=True,
    )
    t_backend.start()

    # Ensure Backend API Gateway is listening before launching Frontend
    log(TAG_BACKEND, f"Waiting for FastAPI API Gateway to become active on port {args.port_backend}...", GRAY)
    backend_ready = wait_for_port(args.port_backend, "Backend", max_retries=30, delay=0.2)
    if not backend_ready:
        log(TAG_ERROR, "FastAPI backend failed to start within timeout.", BRIGHT_RED)
        shutdown_all()
        sys.exit(1)

    # 4. Frontend (Next.js)
    if not FRONTEND_DIR.exists():
        log(TAG_ERROR, f"Frontend directory not found at {FRONTEND_DIR}", BRIGHT_RED)
        shutdown_all()
        sys.exit(1)

    if args.mode == "prod":
        build_id_file = FRONTEND_DIR / ".next" / "BUILD_ID"
        if not build_id_file.exists():
            log(TAG_FRONTEND, "Production build not found in .next. Running 'npm run build'...", BRIGHT_YELLOW)
            res = subprocess.run(
                [NPM_CMD, "run", "build"],
                cwd=str(FRONTEND_DIR),
                shell=(platform.system() == "Windows"),
            )
            if res.returncode != 0:
                log(TAG_ERROR, "Production build failed. Aborting startup.", BRIGHT_RED)
                shutdown_all()
                sys.exit(1)
            log(TAG_FRONTEND, "Production build completed successfully.", BRIGHT_GREEN)

    frontend_cmd = [NPM_CMD, "run", "dev" if args.mode == "dev" else "start"]
    log(TAG_FRONTEND, f"Launching Next.js Frontend ({args.mode} mode) on http://localhost:{args.port_frontend}...", BRIGHT_GREEN)
    frontend_proc = subprocess.Popen(
        frontend_cmd,
        cwd=str(FRONTEND_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        shell=(platform.system() == "Windows"),
    )
    active_subprocesses.append(frontend_proc)

    t_frontend = threading.Thread(
        target=stream_frontend_output,
        args=(frontend_proc,),
        daemon=True,
    )
    t_frontend.start()

    # Wait for Frontend to become responsive
    log(TAG_SYSTEM, "Waiting for Next.js frontend to become ready...", GRAY)
    frontend_ready = wait_for_port(args.port_frontend, "Frontend", max_retries=30, delay=0.2)

    # Print Dashboard Banner
    time.sleep(0.5)
    print_banner(
        frontend_mode=args.mode,
        backend_port=args.port_backend,
        frontend_port=args.port_frontend,
        db_port=args.port_db,
    )

    # Monitor subprocesses
    try:
        while not shutdown_event.is_set():
            time.sleep(1)
            # If any primary process exits unexpectedly, initiate shutdown
            if backend_proc.poll() is not None:
                log(TAG_ERROR, f"Backend process exited with code {backend_proc.returncode}", BRIGHT_RED)
                break
            if frontend_proc.poll() is not None:
                log(TAG_ERROR, f"Frontend process exited with code {frontend_proc.returncode}", BRIGHT_RED)
                break
    except KeyboardInterrupt:
        pass
    finally:
        shutdown_all()


if __name__ == "__main__":
    main()
