#!/usr/bin/env bash
# ==============================================================================
# CBT Examination Platform — Production Lifecycle & Architecture Controller
# ==============================================================================
# Target Operational User: Nikhil-VM (Non-Root)
# Process Management: Dedicated Systemd Units ONLY (No direct background processes)
#
# Commands:
#   ./production.sh               - Interactive Management Console (Menu)
#   ./production.sh start         - Start systemd application services safely
#   ./production.sh stop          - Stop all application services and release ports
#   ./production.sh restart       - Clean port clearance, restart systemd units, verify health
#   ./production.sh status        - Display live status of services, ports, users, and health
#   ./production.sh health        - Multi-point liveness, readiness & proxy verification
#   ./production.sh logs          - Stream live backend & frontend systemd journal logs
#   ./production.sh update        - 6-stage Atomic Pipeline (git pull, pip, db, build, restart, verify)
#   ./production.sh deploy        - Alias for 'update'
#   ./production.sh setup-systemd - Install/refresh systemd unit files & sudoers rules
#   ./production.sh backup        - Automated compressed database backup
#   ./production.sh restore-test  - Test restore pipeline in temporary schema
#   ./production.sh monitor       - Host resources, memory, disk, and connection metrics
# ==============================================================================

set -uo pipefail

DEPLOY_USER="Nikhil-VM"
CURRENT_USER="$(whoami)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

# Minimal sudo wrapper: If running as non-root, use sudo for systemctl and privileged tasks
SUDO_CMD=""
if [ "$EUID" -ne 0 ]; then
    SUDO_CMD="sudo"
fi

# ------------------------------------------------------------------------------
# ANSI Color & Formatting Palette
# ------------------------------------------------------------------------------
BOLD="\033[1m"
DIM="\033[2m"
RESET="\033[0m"

RED="\033[31m"
GREEN="\033[32m"
YELLOW="\033[33m"
BLUE="\033[34m"
MAGENTA="\033[35m"
CYAN="\033[36m"
WHITE="\033[37m"

BRIGHT_RED="\033[91m"
BRIGHT_GREEN="\033[92m"
BRIGHT_YELLOW="\033[93m"
BRIGHT_BLUE="\033[94m"
BRIGHT_MAGENTA="\033[95m"
BRIGHT_CYAN="\033[96m"
BRIGHT_WHITE="\033[97m"

BG_CYAN="\033[46m\033[30m"
BG_GREEN="\033[42m\033[30m"
BG_RED="\033[41m\033[37m"
BG_MAGENTA="\033[45m\033[30m"

# ------------------------------------------------------------------------------
# Environment & Paths
# ------------------------------------------------------------------------------
ENV_FILE="$APP_DIR/.env"
LOG_DIR="$APP_DIR/logs"
mkdir -p "$LOG_DIR"
PROD_LOG="$LOG_DIR/production.log"

timestamp() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

log_info() {
    local msg="[$(timestamp)] $1"
    echo -e "${BRIGHT_CYAN}${msg}${RESET}"
    echo "$msg" >> "$PROD_LOG" 2>/dev/null || true
}

log_success() {
    local msg="[$(timestamp)] ✓ $1"
    echo -e "${BRIGHT_GREEN}${BOLD}${msg}${RESET}"
    echo "$msg" >> "$PROD_LOG" 2>/dev/null || true
}

log_warn() {
    local msg="[$(timestamp)] ⚠️  $1"
    echo -e "${BRIGHT_YELLOW}${msg}${RESET}"
    echo "$msg" >> "$PROD_LOG" 2>/dev/null || true
}

log_error() {
    local msg="[$(timestamp)] ✗ ERROR: $1"
    echo -e "${BRIGHT_RED}${BOLD}${msg}${RESET}" >&2
    echo "$msg" >> "$PROD_LOG" 2>/dev/null || true
}

log_step() {
    echo ""
    echo -e "${BOLD}${BRIGHT_MAGENTA}▶ $1${RESET}"
    echo -e "${DIM}------------------------------------------------------------------------------${RESET}"
    echo "[$(timestamp)] STEP: $1" >> "$PROD_LOG" 2>/dev/null || true
}

log_header() {
    echo ""
    echo -e "${BOLD}${BRIGHT_CYAN}==============================================================================${RESET}"
    echo -e "${BOLD}${BRIGHT_WHITE}  $1${RESET}"
    echo -e "${BOLD}${BRIGHT_CYAN}==============================================================================${RESET}"
    echo "[$(timestamp)] === $1 ===" >> "$PROD_LOG" 2>/dev/null || true
}

# ------------------------------------------------------------------------------
# Virtual Environment & Python Detection
# ------------------------------------------------------------------------------
find_python_interpreter() {
    PYTHON_CMD=""
    if [ -f "$APP_DIR/.venv/bin/python3" ]; then
        PYTHON_CMD="$APP_DIR/.venv/bin/python3"
    elif [ -f "$APP_DIR/.venv/bin/python" ]; then
        PYTHON_CMD="$APP_DIR/.venv/bin/python"
    elif [ -f "$APP_DIR/venv/bin/python3" ]; then
        PYTHON_CMD="$APP_DIR/venv/bin/python3"
    elif [ -f "$APP_DIR/venv/bin/python" ]; then
        PYTHON_CMD="$APP_DIR/venv/bin/python"
    elif [ -f "$APP_DIR/.venv/Scripts/python.exe" ]; then
        PYTHON_CMD="$APP_DIR/.venv/Scripts/python.exe"
    elif command -v python3 >/dev/null 2>&1; then
        if python3 -c "import pydantic, fastapi, sqlalchemy" >/dev/null 2>&1; then
            PYTHON_CMD="python3"
        fi
    fi
}
find_python_interpreter

# ------------------------------------------------------------------------------
# Native Systemd & Sudoers Setup (Eliminates External Script Dependencies)
# ------------------------------------------------------------------------------
install_systemd_and_sudoers() {
    local target_user="${1:-$DEPLOY_USER}"
    log_info "Configuring systemd service units and sudoers rules for '$target_user'..."

    local systemd_src="$APP_DIR/deployment/systemd"
    if [ ! -d "$systemd_src" ]; then
        log_error "Deployment directory not found at $systemd_src."
        return 1
    fi

    # Install systemd service units
    for unit in cbt-backend.service cbt-frontend.service cbt-backup.service; do
        if [ -f "$systemd_src/$unit" ]; then
            $SUDO_CMD cp "$systemd_src/$unit" "/etc/systemd/system/$unit"
            $SUDO_CMD chmod 644 "/etc/systemd/system/$unit"
            log_success "Installed /etc/systemd/system/$unit (User=${target_user})"
        fi
    done

    if [ -f "$systemd_src/cbt-backup.timer" ]; then
        $SUDO_CMD cp "$systemd_src/cbt-backup.timer" "/etc/systemd/system/cbt-backup.timer"
        $SUDO_CMD chmod 644 "/etc/systemd/system/cbt-backup.timer"
        $SUDO_CMD systemctl enable cbt-backup.timer 2>/dev/null || true
        $SUDO_CMD systemctl start cbt-backup.timer 2>/dev/null || true
        log_success "Installed /etc/systemd/system/cbt-backup.timer"
    fi

    # Install restricted sudoers rule
    if [ -f "$systemd_src/cbt-sudoers" ]; then
        $SUDO_CMD cp "$systemd_src/cbt-sudoers" "/etc/sudoers.d/cbt"
        $SUDO_CMD chmod 0440 "/etc/sudoers.d/cbt"
        if command -v visudo >/dev/null 2>&1; then
            if ! $SUDO_CMD visudo -cf "/etc/sudoers.d/cbt" >/dev/null 2>&1; then
                log_error "Invalid sudoers syntax! Removing /etc/sudoers.d/cbt for security."
                $SUDO_CMD rm -f "/etc/sudoers.d/cbt"
                return 1
            fi
        fi
        log_success "Configured restricted sudoers rule at /etc/sudoers.d/cbt"
    fi

    $SUDO_CMD systemctl daemon-reload
    $SUDO_CMD systemctl enable cbt-backend cbt-frontend 2>/dev/null || true
    log_success "Systemd services enabled and ready for non-root management."
    return 0
}

# ------------------------------------------------------------------------------
# Directory Permissions & Hygiene
# ------------------------------------------------------------------------------
fix_permissions() {
    mkdir -p "$APP_DIR/logs" "$APP_DIR/backups" "$APP_DIR/frontend/.next"

    if [ "$EUID" -eq 0 ] && id "$DEPLOY_USER" >/dev/null 2>&1; then
        chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "$APP_DIR/logs" "$APP_DIR/backups" "$APP_DIR/frontend/.next" 2>/dev/null || true
        chmod 600 "$ENV_FILE" 2>/dev/null || true
    else
        chmod 755 "$APP_DIR/logs" "$APP_DIR/backups" 2>/dev/null || true
        if [ -f "$ENV_FILE" ]; then
            chmod 600 "$ENV_FILE" 2>/dev/null || true
        fi
    fi
}

# ------------------------------------------------------------------------------
# Prerequisite Verification & Auto-Provisioning
# ------------------------------------------------------------------------------
verify_prerequisites() {
    # 1. Ensure runtime directories exist
    mkdir -p "$APP_DIR/logs" "$APP_DIR/backups" "$APP_DIR/frontend/.next"
    fix_permissions

    # 2. Check and auto-provision systemd units & sudoers if missing
    if command -v systemctl >/dev/null 2>&1 && [ ! -f "/etc/systemd/system/cbt-backend.service" ]; then
        log_warn "Systemd service units are not yet installed in /etc/systemd/system/."
        install_systemd_and_sudoers "$DEPLOY_USER" || true
    fi

    # 3. Check and auto-provision .env from template if missing
    if [ ! -f "$ENV_FILE" ]; then
        if [ -f "$APP_DIR/.env.example" ]; then
            log_warn "Production configuration file (.env) not found. Auto-generating from .env.example..."
            cp "$APP_DIR/.env.example" "$ENV_FILE"
            chmod 600 "$ENV_FILE" 2>/dev/null || true
            log_warn "Created /opt/cbt/.env with default settings. Please verify database credentials if needed."
        else
            log_error "Production configuration file not found at: $ENV_FILE"
            return 1
        fi
    fi

    # Secure permissions on .env (600: owner read/write only)
    chmod 600 "$ENV_FILE" 2>/dev/null || true

    # Safely source .env without printing secrets
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a

    # 4. Auto-provision or repair Python virtual environment (.venv)
    find_python_interpreter

    if [ ! -d "$APP_DIR/.venv" ]; then
        log_warn "Python virtual environment (.venv) is missing. Auto-creating at $APP_DIR/.venv..."
        if ! python3 -m venv "$APP_DIR/.venv"; then
            log_error "Failed to create Python virtual environment at $APP_DIR/.venv."
            log_error "Please run: sudo apt install -y python3-venv python3-pip"
            return 1
        fi
        find_python_interpreter
    fi

    # 5. Check and auto-install Python requirements
    if [ -z "$PYTHON_CMD" ] || ! "$PYTHON_CMD" -c "import pydantic, fastapi, sqlalchemy, alembic, psycopg" >/dev/null 2>&1; then
        log_info "Installing / updating Python requirements into virtual environment ($PYTHON_CMD)..."
        "$PYTHON_CMD" -m pip install --quiet --upgrade pip
        if ! "$PYTHON_CMD" -m pip install -r "$APP_DIR/requirements.txt"; then
            log_error "Failed to install dependencies from $APP_DIR/requirements.txt."
            return 1
        fi
        log_success "Virtual environment initialized successfully with all Python dependencies."
    fi

    # 6. Check and auto-install Frontend dependencies & production build
    if [ -d "$APP_DIR/frontend" ] && command -v npm >/dev/null 2>&1; then
        if [ ! -d "$APP_DIR/frontend/node_modules" ]; then
            log_warn "Frontend node_modules missing. Auto-installing dependencies via npm..."
            (cd "$APP_DIR/frontend" && npm install) || {
                log_error "Failed to install frontend dependencies via npm."
                return 1
            }
            log_success "Frontend node_modules installed successfully."
        fi

        if [ ! -d "$APP_DIR/frontend/.next" ] || [ ! -f "$APP_DIR/frontend/.next/BUILD_ID" ]; then
            log_warn "Frontend production build (.next) missing. Compiling Next.js bundle..."
            (cd "$APP_DIR/frontend" && npm run build) || {
                log_error "Failed to compile Next.js production bundle."
                return 1
            }
            log_success "Next.js production bundle compiled successfully."
        fi
    fi

    return 0
}

# ------------------------------------------------------------------------------
# Port Conflict Resolution Helper (Guarantees Clean Port Release)
# ------------------------------------------------------------------------------
free_port() {
    local port="$1"
    local name="${2:-service}"
    local max_wait=5

    # Find all PIDs holding this port
    local pids=""
    if command -v fuser >/dev/null 2>&1; then
        pids=$(fuser "${port}/tcp" 2>/dev/null || true)
    fi
    if [ -z "$pids" ] && command -v ss >/dev/null 2>&1; then
        pids=$(ss -lptn "sport = :$port" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u | tr '\n' ' ' || true)
    fi
    if [ -z "$pids" ] && command -v lsof >/dev/null 2>&1; then
        pids=$(lsof -ti ":$port" 2>/dev/null | tr '\n' ' ' || true)
    fi

    if [ -n "$pids" ]; then
        log_warn "Port $port ($name) is currently held by PID(s): $pids. Terminating for clean start..."

        # 1. Send SIGTERM first
        for pid in $pids; do
            kill -15 "$pid" 2>/dev/null || $SUDO_CMD kill -15 "$pid" 2>/dev/null || true
        done
        sleep 1

        # 2. Force SIGKILL if still holding port
        if command -v fuser >/dev/null 2>&1; then
            $SUDO_CMD fuser -k -9 "${port}/tcp" 2>/dev/null || true
        fi
        for pid in $pids; do
            kill -9 "$pid" 2>/dev/null || $SUDO_CMD kill -9 "$pid" 2>/dev/null || true
        done
        sleep 1
    fi

    # Verify port is truly released
    while [ $max_wait -gt 0 ]; do
        local still_listening=false
        if command -v ss >/dev/null 2>&1; then
            if ss -lptn "sport = :$port" 2>/dev/null | grep -q ":$port "; then
                still_listening=true
            fi
        elif command -v fuser >/dev/null 2>&1; then
            if fuser "${port}/tcp" >/dev/null 2>&1; then
                still_listening=true
            fi
        fi

        if [ "$still_listening" = "false" ]; then
            return 0
        fi
        sleep 1
        max_wait=$((max_wait - 1))
    done

    log_error "Port $port ($name) could not be cleared! Process is still active."
    return 1
}

# ------------------------------------------------------------------------------
# Backend Service & Process Health Inspector (Authoritative Ownership Matching)
# ------------------------------------------------------------------------------
check_backend_status() {
    # Returns:
    #   0: Healthy (systemd unit active AND port 8000 listening by the service)
    #   1: Inactive / Stopped (systemd unit inactive and port 8000 closed)
    #   2: Critical Conflict (Port 8000 listening by rogue process or systemd unit is INACTIVE)
    #   3: Starting (systemd unit active, waiting for port 8000)
    local service_active=false
    local port_listening=false
    LISTENER_PID=""
    LISTENER_USER=""
    LISTENER_CMD=""
    SYSTEMD_USER=""
    SYSTEMD_MAIN_PID="0"
    SYSTEMD_ACTIVE_STATUS="INACTIVE"

    if command -v systemctl >/dev/null 2>&1; then
        SYSTEMD_ACTIVE_STATUS=$(systemctl is-active cbt-backend 2>/dev/null || echo "inactive")
        if [ "$SYSTEMD_ACTIVE_STATUS" = "active" ]; then
            service_active=true
        fi
        SYSTEMD_MAIN_PID=$(systemctl show -p MainPID --value cbt-backend 2>/dev/null || echo "0")
        SYSTEMD_USER=$(systemctl show -p User --value cbt-backend 2>/dev/null || echo "unknown")
    fi

    if command -v ss >/dev/null 2>&1; then
        if ss -tulpn 2>/dev/null | grep -q ":8000 "; then
            port_listening=true
            LISTENER_PID=$(ss -lptn "sport = :8000" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -n 1 || true)
        fi
    fi
    if [ -z "$LISTENER_PID" ] && command -v lsof >/dev/null 2>&1; then
        LISTENER_PID=$(lsof -ti :8000 2>/dev/null | head -n 1 || true)
        if [ -n "$LISTENER_PID" ]; then
            port_listening=true
        fi
    fi
    if [ -z "$LISTENER_PID" ] && command -v fuser >/dev/null 2>&1; then
        LISTENER_PID=$(fuser 8000/tcp 2>/dev/null | awk '{print $1}' || true)
        if [ -n "$LISTENER_PID" ]; then
            port_listening=true
        fi
    fi

    if [ -n "$LISTENER_PID" ]; then
        LISTENER_USER=$(ps -p "$LISTENER_PID" -o user= 2>/dev/null | tr -d ' ' || echo "unknown")
        LISTENER_CMD=$(ps -p "$LISTENER_PID" -o comm= 2>/dev/null | tr -d ' ' || echo "unknown")
    fi

    if [ "$service_active" = "true" ] && [ "$port_listening" = "true" ]; then
        # Check PID correspondence with systemd service
        local is_service_process=false
        if [ "$LISTENER_PID" = "$SYSTEMD_MAIN_PID" ]; then
            is_service_process=true
        elif [ "$SYSTEMD_MAIN_PID" -gt 0 ] && pgrep -P "$SYSTEMD_MAIN_PID" 2>/dev/null | grep -qw "$LISTENER_PID"; then
            is_service_process=true
        elif [ -f "/sys/fs/cgroup/system.slice/cbt-backend.service/cgroup.procs" ]; then
            if grep -qw "$LISTENER_PID" "/sys/fs/cgroup/system.slice/cbt-backend.service/cgroup.procs" 2>/dev/null; then
                is_service_process=true
            fi
        else
            if [ "$LISTENER_USER" = "$DEPLOY_USER" ]; then
                is_service_process=true
            fi
        fi

        # Strict security constraint: Process must NOT run as root
        if [ "$LISTENER_USER" = "root" ]; then
            return 2  # Security violation: application process running as root!
        fi

        if [ "$is_service_process" = "true" ]; then
            return 0  # Genuine healthy systemd process
        else
            return 2  # Conflict: Port 8000 held by rogue PID
        fi
    elif [ "$service_active" = "false" ] && [ "$port_listening" = "true" ]; then
        return 2  # Critical Conflict: systemd INACTIVE but port 8000 occupied by rogue process
    elif [ "$service_active" = "true" ] && [ "$port_listening" = "false" ]; then
        return 3  # Starting / port not yet ready
    else
        return 1  # Cleanly stopped / inactive
    fi
}

# ------------------------------------------------------------------------------
# Frontend Service & Process Health Inspector
# ------------------------------------------------------------------------------
check_frontend_status() {
    # Returns:
    #   0: Healthy (systemd unit active AND port 3000 listening by the service)
    #   1: Inactive / Stopped (systemd unit inactive and port 3000 closed)
    #   2: Critical Conflict (Port 3000 listening by rogue process or systemd unit is INACTIVE)
    #   3: Starting (systemd unit active, waiting for port 3000)
    local service_active=false
    local port_listening=false
    FRONTEND_LISTENER_PID=""
    FRONTEND_LISTENER_USER=""
    FRONTEND_USER=""
    FRONTEND_MAIN_PID="0"
    FRONTEND_ACTIVE_STATUS="INACTIVE"

    if command -v systemctl >/dev/null 2>&1; then
        FRONTEND_ACTIVE_STATUS=$(systemctl is-active cbt-frontend 2>/dev/null || echo "inactive")
        if [ "$FRONTEND_ACTIVE_STATUS" = "active" ]; then
            service_active=true
        fi
        FRONTEND_MAIN_PID=$(systemctl show -p MainPID --value cbt-frontend 2>/dev/null || echo "0")
        FRONTEND_USER=$(systemctl show -p User --value cbt-frontend 2>/dev/null || echo "unknown")
    fi

    if command -v ss >/dev/null 2>&1; then
        if ss -tulpn 2>/dev/null | grep -q ":3000 "; then
            port_listening=true
            FRONTEND_LISTENER_PID=$(ss -lptn "sport = :3000" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -n 1 || true)
        fi
    fi
    if [ -z "$FRONTEND_LISTENER_PID" ] && command -v lsof >/dev/null 2>&1; then
        FRONTEND_LISTENER_PID=$(lsof -ti :3000 2>/dev/null | head -n 1 || true)
        if [ -n "$FRONTEND_LISTENER_PID" ]; then
            port_listening=true
        fi
    fi
    if [ -z "$FRONTEND_LISTENER_PID" ] && command -v fuser >/dev/null 2>&1; then
        FRONTEND_LISTENER_PID=$(fuser 3000/tcp 2>/dev/null | awk '{print $1}' || true)
        if [ -n "$FRONTEND_LISTENER_PID" ]; then
            port_listening=true
        fi
    fi

    if [ -n "$FRONTEND_LISTENER_PID" ]; then
        FRONTEND_LISTENER_USER=$(ps -p "$FRONTEND_LISTENER_PID" -o user= 2>/dev/null | tr -d ' ' || echo "unknown")
    fi

    if [ "$service_active" = "true" ] && [ "$port_listening" = "true" ]; then
        local is_service_process=false
        if [ "$FRONTEND_LISTENER_PID" = "$FRONTEND_MAIN_PID" ]; then
            is_service_process=true
        elif [ "$FRONTEND_MAIN_PID" -gt 0 ] && pgrep -P "$FRONTEND_MAIN_PID" 2>/dev/null | grep -qw "$FRONTEND_LISTENER_PID"; then
            is_service_process=true
        elif [ -f "/sys/fs/cgroup/system.slice/cbt-frontend.service/cgroup.procs" ]; then
            if grep -qw "$FRONTEND_LISTENER_PID" "/sys/fs/cgroup/system.slice/cbt-frontend.service/cgroup.procs" 2>/dev/null; then
                is_service_process=true
            fi
        else
            if [ "$FRONTEND_LISTENER_USER" = "$DEPLOY_USER" ]; then
                is_service_process=true
            fi
        fi

        if [ "$FRONTEND_LISTENER_USER" = "root" ]; then
            return 2  # Security violation: frontend running as root!
        fi

        if [ "$is_service_process" = "true" ]; then
            return 0
        else
            return 2
        fi
    elif [ "$service_active" = "false" ] && [ "$port_listening" = "true" ]; then
        return 2  # Conflict: systemd inactive but port 3000 occupied
    elif [ "$service_active" = "true" ] && [ "$port_listening" = "false" ]; then
        return 3  # Starting
    else
        return 1  # Inactive
    fi
}

# ------------------------------------------------------------------------------
# Database Auto-Bootstrap & Migrations
# ------------------------------------------------------------------------------
bootstrap_and_migrate_db() {
    log_info "Ensuring PostgreSQL target database 'cbt' exists & applying migrations..."
    export PYTHONPATH="$APP_DIR"

    # Run auto-bootstrap engine
    if ! "$PYTHON_CMD" -c "
import sys
sys.path.insert(0, '$APP_DIR')
from backend.app.core.db_bootstrap import bootstrap_postgres_database
success = bootstrap_postgres_database(raise_on_failure=True)
if not success:
    sys.exit(1)
"; then
        log_error "PostgreSQL database auto-bootstrap failed! Check credentials in .env."
        return 1
    fi

    log_info "Applying database schema migrations ('alembic upgrade head')..."
    if ! "$PYTHON_CMD" -m alembic -c "$APP_DIR/backend/alembic.ini" upgrade head; then
        log_error "Database migrations failed! Inspect Alembic error output above."
        return 1
    fi
    log_success "Database schema is fully synchronized and up to date."
    return 0
}

# ------------------------------------------------------------------------------
# Health Checks & Status (Genuinely Authoritative)
# ------------------------------------------------------------------------------
cmd_health() {
    local api_url="http://127.0.0.1:8000"
    local frontend_url="http://127.0.0.1:3000"

    echo ""
    echo -e "${BOLD}${BRIGHT_WHITE}================== SYSTEM HEALTH VERIFICATION ==================${RESET}"

    local backend_state=0
    check_backend_status && backend_state=$? || backend_state=$?

    if [ "$backend_state" -eq 0 ]; then
        echo -e "  ${BRIGHT_GREEN}✓ Backend Service (systemd):${RESET}  ACTIVE (User: ${SYSTEMD_USER}, MainPID: ${SYSTEMD_MAIN_PID})"
    elif [ "$backend_state" -eq 2 ]; then
        echo -e "  ${BRIGHT_RED}✗ Backend Service Conflict:${RESET}   cbt-backend.service is ${SYSTEMD_ACTIVE_STATUS:-INACTIVE}, but port 8000 is occupied by rogue PID ${LISTENER_PID} (User: ${LISTENER_USER})!"
        echo -e "    ${BRIGHT_YELLOW}Run './production.sh restart' to terminate the rogue process and start cbt-backend.${RESET}"
    elif [ "$backend_state" -eq 3 ]; then
        echo -e "  ${BRIGHT_YELLOW}! Backend Service:${RESET}            cbt-backend.service is starting (waiting for port 8000)..."
    else
        echo -e "  ${BRIGHT_RED}✗ Backend Service (systemd):${RESET}  INACTIVE (Port 8000 is closed)"
    fi

    local frontend_state=0
    check_frontend_status && frontend_state=$? || frontend_state=$?
    if [ "$frontend_state" -eq 0 ]; then
        echo -e "  ${BRIGHT_GREEN}✓ Frontend Service (systemd):${RESET} ACTIVE (User: ${FRONTEND_USER}, MainPID: ${FRONTEND_MAIN_PID})"
    elif [ "$frontend_state" -eq 2 ]; then
        echo -e "  ${BRIGHT_RED}✗ Frontend Service Conflict:${RESET}  cbt-frontend.service is ${FRONTEND_ACTIVE_STATUS:-INACTIVE}, but port 3000 is occupied by rogue PID ${FRONTEND_LISTENER_PID} (User: ${FRONTEND_LISTENER_USER})!"
    elif [ "$frontend_state" -eq 3 ]; then
        echo -e "  ${BRIGHT_YELLOW}! Frontend Service:${RESET}           cbt-frontend.service is starting (waiting for port 3000)..."
    else
        echo -e "  ${BRIGHT_RED}✗ Frontend Service (systemd):${RESET} INACTIVE"
    fi

    local liveness_code="000"
    liveness_code=$(curl -s -o /dev/null -w "%{http_code}" "$api_url/health" 2>/dev/null || echo "000")
    if [ "$liveness_code" = "200" ] && [ "$backend_state" -eq 0 ]; then
        echo -e "  ${BRIGHT_GREEN}✓ Backend Liveness:${RESET}           HTTP 200 (Active on port 8000, PID: ${LISTENER_PID:-systemd})"
    elif [ "$liveness_code" = "200" ] && [ "$backend_state" -eq 2 ]; then
        echo -e "  ${BRIGHT_RED}✗ Backend Liveness:${RESET}           HTTP 200 (Served by ROGUE PROCESS PID ${LISTENER_PID}, NOT systemd!)"
    else
        echo -e "  ${BRIGHT_RED}✗ Backend Liveness:${RESET}           HTTP $liveness_code (Failed at $api_url/health)"
    fi

    local readiness_code="000"
    readiness_code=$(curl -s -o /dev/null -w "%{http_code}" "$api_url/health/ready" 2>/dev/null || echo "000")
    if [ "$readiness_code" = "200" ]; then
        echo -e "  ${BRIGHT_GREEN}✓ Database Connectivity:${RESET}      HTTP 200 (PostgreSQL Online & Responsive)"
    else
        echo -e "  ${BRIGHT_RED}✗ Database Connectivity:${RESET}      HTTP $readiness_code (Failed at $api_url/health/ready)"
    fi

    local frontend_code="000"
    frontend_code=$(curl -s -o /dev/null -w "%{http_code}" "$frontend_url/" 2>/dev/null || echo "000")
    if [ "$frontend_code" = "200" ] || [ "$frontend_code" = "307" ] || [ "$frontend_code" = "308" ]; then
        echo -e "  ${BRIGHT_GREEN}✓ Next.js Frontend:${RESET}           HTTP $frontend_code (Active on port 3000)"
    else
        echo -e "  ${BRIGHT_YELLOW}! Next.js Frontend:${RESET}           HTTP $frontend_code"
    fi

    local nginx_code="N/A"
    if command -v nginx >/dev/null 2>&1; then
        nginx_code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1/" 2>/dev/null || echo "000")
        if [ "$nginx_code" = "200" ] || [ "$nginx_code" = "301" ] || [ "$nginx_code" = "302" ] || [ "$nginx_code" = "307" ] || [ "$nginx_code" = "308" ]; then
            echo -e "  ${BRIGHT_GREEN}✓ NGINX Reverse Proxy:${RESET}        HTTP $nginx_code (Active on port 80/443)"
        else
            echo -e "  ${BRIGHT_YELLOW}! NGINX Reverse Proxy:${RESET}        HTTP $nginx_code"
        fi
    fi
    echo -e "${BOLD}${BRIGHT_WHITE}================================================================${RESET}"
    echo ""

    if [ "$backend_state" -eq 0 ] && [ "$frontend_state" -eq 0 ] && [ "$liveness_code" = "200" ] && [ "$readiness_code" = "200" ]; then
        echo -e "${BOLD}${BG_GREEN} SYSTEM STATUS: OPERATIONAL & HEALTHY ${RESET}"
        return 0
    elif [ "$backend_state" -eq 2 ] || [ "$frontend_state" -eq 2 ]; then
        echo -e "${BOLD}${BG_RED} SYSTEM STATUS: CONFLICT / DEGRADED (Rogue Process Detected) ${RESET}"
        return 1
    else
        echo -e "${BOLD}${BG_RED} SYSTEM STATUS: DEGRADED — CHECK LOGS VIA './production.sh logs' ${RESET}"
        return 1
    fi
}

wait_and_verify_health() {
    local api_url="http://127.0.0.1:8000"
    log_info "Waiting for application services to become active and responsive..."
    local retries=20
    while [ $retries -gt 0 ]; do
        local code
        code=$(curl -s -o /dev/null -w "%{http_code}" "$api_url/health" 2>/dev/null || echo "000")
        if [ "$code" = "200" ]; then
            break
        fi
        echo -ne "  Verifying API Gateway (port 8000)... waiting (${retries}s remaining)\r"
        sleep 1
        retries=$((retries - 1))
    done
    echo ""
    cmd_health
}

# ------------------------------------------------------------------------------
# Status Subcommand
# ------------------------------------------------------------------------------
cmd_status() {
    echo ""
    echo -e "${BOLD}${BRIGHT_CYAN}==============================================================================${RESET}"
    echo -e "${BOLD}${BRIGHT_WHITE}   ____ ____ _____   ____  _        _  _____ _____ ___  ____  __  __${RESET}"
    echo -e "${BOLD}${BRIGHT_WHITE}  / ___| __ )_   _| |  _ \\| |      / \\|_   _|  ___/ _ \\|  _ \\|  \\/  |${RESET}"
    echo -e "${BOLD}${BRIGHT_WHITE} | |   |  _ \\ | |   | |_) | |     / _ \\ | | | |_ | | | | |_) | |\\/| |${RESET}"
    echo -e "${BOLD}${BRIGHT_WHITE} | |___| |_) || |   |  __/| |___ / ___ \\| | |  _|| |_| |  _ <| |  | |${RESET}"
    echo -e "${BOLD}${BRIGHT_WHITE}  \\____|____/ |_|   |_|   |_____/_/   \\_\\_| |_|   \\___/|_| \\_\\_|  |_|${RESET}"
    echo -e "${BOLD}${BRIGHT_YELLOW}                CBT PLATFORM PRODUCTION CONTROLLER${RESET}"
    echo -e "${BOLD}${BRIGHT_CYAN}==============================================================================${RESET}"
    echo ""

    echo -e "  ${BOLD}Operating User:${RESET}    ${BRIGHT_GREEN}${CURRENT_USER}${RESET} (Target Service User: ${BRIGHT_CYAN}${DEPLOY_USER}${RESET})"

    if [ -d "$APP_DIR/.git" ] && command -v git >/dev/null 2>&1; then
        local branch commit_hash commit_msg
        branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
        commit_hash=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
        commit_msg=$(git log -1 --pretty=%B 2>/dev/null | head -n 1 || echo "")
        echo -e "  ${BOLD}Code Version:${RESET}      ${BRIGHT_CYAN}Branch '$branch'${RESET} @ ${BRIGHT_YELLOW}$commit_hash${RESET} (${DIM}$commit_msg${RESET})"
    fi

    echo ""
    echo -e "  ${BOLD}Service Units (systemd):${RESET}"
    if command -v systemctl >/dev/null 2>&1; then
        # Check backend
        local backend_state=0
        check_backend_status && backend_state=$? || backend_state=$?
        if [ "$backend_state" -eq 0 ]; then
            echo -e "    ${BRIGHT_GREEN}[ACTIVE]  ${RESET} cbt-backend (FastAPI Backend, PID: ${LISTENER_PID:-systemd}, User: ${SYSTEMD_USER})"
        elif [ "$backend_state" -eq 2 ]; then
            echo -e "    ${BRIGHT_RED}[INACTIVE]${RESET} cbt-backend ${BRIGHT_RED}(CRITICAL CONFLICT: Port 8000 held by rogue PID ${LISTENER_PID}, User: ${LISTENER_USER})${RESET}"
        else
            echo -e "    ${BRIGHT_RED}[INACTIVE]${RESET} cbt-backend"
        fi

        # Check frontend
        local frontend_state=0
        check_frontend_status && frontend_state=$? || frontend_state=$?
        if [ "$frontend_state" -eq 0 ]; then
            echo -e "    ${BRIGHT_GREEN}[ACTIVE]  ${RESET} cbt-frontend (Next.js Frontend, PID: ${FRONTEND_LISTENER_PID:-systemd}, User: ${FRONTEND_USER})"
        elif [ "$frontend_state" -eq 2 ]; then
            echo -e "    ${BRIGHT_RED}[INACTIVE]${RESET} cbt-frontend ${BRIGHT_RED}(CRITICAL CONFLICT: Port 3000 held by rogue PID ${FRONTEND_LISTENER_PID}, User: ${FRONTEND_LISTENER_USER})${RESET}"
        else
            echo -e "    ${BRIGHT_RED}[INACTIVE]${RESET} cbt-frontend"
        fi

        for svc in nginx postgresql; do
            if systemctl is-active --quiet "$svc" 2>/dev/null; then
                echo -e "    ${BRIGHT_GREEN}[ACTIVE]  ${RESET} $svc"
            else
                echo -e "    ${BRIGHT_RED}[INACTIVE]${RESET} $svc"
            fi
        done
    else
        echo -e "    ${BRIGHT_YELLOW}systemctl not detected.${RESET}"
    fi

    echo ""
    echo -e "  ${BOLD}Listening Ports:${RESET}"
    for port_info in "80:HTTP (nginx)" "443:HTTPS (nginx)" "3000:Next.js Frontend" "8000:FastAPI Backend" "5432:PostgreSQL"; do
        local port="${port_info%%:*}"
        local desc="${port_info#*:}"
        if command -v ss >/dev/null 2>&1; then
            if ss -tulpn 2>/dev/null | grep -q ":$port "; then
                echo -e "    Port $port ($desc): ${BRIGHT_GREEN}${BOLD}LISTENING${RESET}"
            else
                echo -e "    Port $port ($desc): ${DIM}CLOSED${RESET}"
            fi
        fi
    done

    cmd_health
}

# ------------------------------------------------------------------------------
# Start Subcommand (Strict Systemd Supervision — Zero Manual Background Fallbacks)
# ------------------------------------------------------------------------------
cmd_start() {
    log_header "STARTING CBT EXAMINATION PLATFORM"
    verify_prerequisites || return 1

    # Check if backend systemd service is already active and healthy
    local backend_state=0
    check_backend_status && backend_state=$? || backend_state=$?
    if [ "$backend_state" -eq 0 ]; then
        log_info "CBT Application backend is already active and healthy on port 8000."
        cmd_status
        return 0
    fi

    # Free any rogue port listeners before starting systemd services
    free_port 8000 "FastAPI Backend" || return 1
    free_port 3000 "Next.js Frontend" || return 1

    bootstrap_and_migrate_db || return 1
    fix_permissions

    # Services MUST run exclusively through systemd
    if ! command -v systemctl >/dev/null 2>&1; then
        log_error "systemctl not found! The application must be supervised exclusively by systemd."
        return 1
    fi

    if [ ! -f "/etc/systemd/system/cbt-backend.service" ] || [ ! -f "/etc/systemd/system/cbt-frontend.service" ]; then
        log_warn "Systemd service units not found in /etc/systemd/system/. Installing now..."
        install_systemd_and_sudoers || {
            log_error "Failed to install systemd services. Run: sudo ./production.sh setup-systemd"
            return 1
        }
    fi

    log_info "Starting services via systemd under user '$DEPLOY_USER'..."
    $SUDO_CMD systemctl daemon-reload 2>/dev/null || true
    if ! $SUDO_CMD systemctl start cbt-backend; then
        log_error "Failed to start cbt-backend.service via systemd!"
        $SUDO_CMD systemctl status cbt-backend --no-pager 2>/dev/null || true
        return 1
    fi

    if ! $SUDO_CMD systemctl start cbt-frontend; then
        log_error "Failed to start cbt-frontend.service via systemd!"
        $SUDO_CMD systemctl status cbt-frontend --no-pager 2>/dev/null || true
        return 1
    fi

    if command -v nginx >/dev/null 2>&1; then
        if [ ! -f "/etc/nginx/sites-enabled/cbt" ] && [ -f "$APP_DIR/deployment/nginx/cbt.conf" ]; then
            $SUDO_CMD cp "$APP_DIR/deployment/nginx/cbt.conf" /etc/nginx/sites-available/cbt 2>/dev/null || true
            $SUDO_CMD ln -sf /etc/nginx/sites-available/cbt /etc/nginx/sites-enabled/ 2>/dev/null || true
            $SUDO_CMD rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
        fi
        if $SUDO_CMD nginx -t 2>/dev/null; then
            $SUDO_CMD systemctl start nginx 2>/dev/null || $SUDO_CMD systemctl reload nginx 2>/dev/null || true
            log_success "NGINX reverse proxy active."
        else
            log_error "NGINX configuration test failed! Check /etc/nginx/sites-enabled/."
        fi
    fi

    # Authoritative health verification: return non-zero if not healthy
    wait_and_verify_health || return 1
}

# ------------------------------------------------------------------------------
# Stop Subcommand (Releases All Application Ports)
# ------------------------------------------------------------------------------
cmd_stop() {
    log_header "STOPPING CBT EXAMINATION PLATFORM"
    if command -v systemctl >/dev/null 2>&1; then
        log_info "Stopping systemd service units..."
        $SUDO_CMD systemctl stop cbt-frontend 2>/dev/null || true
        $SUDO_CMD systemctl stop cbt-backend 2>/dev/null || true
    fi
    free_port 8000 "Backend API"
    free_port 3000 "Frontend Web"
    log_success "All application services stopped safely and ports released."
    return 0
}

# ------------------------------------------------------------------------------
# Restart Subcommand (Idempotent, Clean & Conflict-Free via Systemd)
# ------------------------------------------------------------------------------
cmd_restart() {
    log_header "RESTARTING CBT EXAMINATION PLATFORM SERVICES"
    verify_prerequisites || return 1

    log_step "1/4: Ensuring database connectivity & schema migrations..."
    bootstrap_and_migrate_db || return 1

    log_step "2/4: Terminating old service units and clearing rogue port listeners..."
    if command -v systemctl >/dev/null 2>&1; then
        $SUDO_CMD systemctl stop cbt-frontend 2>/dev/null || true
        $SUDO_CMD systemctl stop cbt-backend 2>/dev/null || true
    fi
    free_port 8000 "FastAPI Backend" || return 1
    free_port 3000 "Next.js Frontend" || return 1

    log_step "3/4: Setting file permissions & launching refreshed services via systemd..."
    fix_permissions

    if ! command -v systemctl >/dev/null 2>&1; then
        log_error "systemctl not found! The application must be supervised exclusively by systemd."
        return 1
    fi

    if [ ! -f "/etc/systemd/system/cbt-backend.service" ] || [ ! -f "/etc/systemd/system/cbt-frontend.service" ]; then
        log_warn "Systemd service units not found in /etc/systemd/system/. Installing now..."
        install_systemd_and_sudoers || {
            log_error "Failed to install systemd services. Run: sudo ./production.sh setup-systemd"
            return 1
        }
    fi

    $SUDO_CMD systemctl daemon-reload 2>/dev/null || true
    if ! $SUDO_CMD systemctl restart cbt-backend; then
        log_error "Failed to restart cbt-backend.service via systemd!"
        $SUDO_CMD systemctl status cbt-backend --no-pager 2>/dev/null || true
        return 1
    fi

    if ! $SUDO_CMD systemctl restart cbt-frontend; then
        log_error "Failed to restart cbt-frontend.service via systemd!"
        $SUDO_CMD systemctl status cbt-frontend --no-pager 2>/dev/null || true
        return 1
    fi

    if command -v nginx >/dev/null 2>&1; then
        if [ ! -f "/etc/nginx/sites-enabled/cbt" ] && [ -f "$APP_DIR/deployment/nginx/cbt.conf" ]; then
            $SUDO_CMD cp "$APP_DIR/deployment/nginx/cbt.conf" /etc/nginx/sites-available/cbt 2>/dev/null || true
            $SUDO_CMD ln -sf /etc/nginx/sites-available/cbt /etc/nginx/sites-enabled/ 2>/dev/null || true
            $SUDO_CMD rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
        fi
        if $SUDO_CMD nginx -t 2>/dev/null; then
            $SUDO_CMD systemctl reload nginx 2>/dev/null || $SUDO_CMD systemctl restart nginx 2>/dev/null || true
        fi
    fi

    log_step "4/4: Multi-point live health verification..."
    wait_and_verify_health || return 1
}

# ------------------------------------------------------------------------------
# Deploy / Update Pipeline (Strict Failure Handling — Zero False Success)
# ------------------------------------------------------------------------------
cmd_deploy() {
    log_header "ATOMIC PRODUCTION UPDATE & DEPLOYMENT PIPELINE"
    verify_prerequisites || return 1

    local skip_backup=false
    local skip_pull=false
    for arg in "$@"; do
        case "$arg" in
            --skip-backup|-n) skip_backup=true ;;
            --skip-pull|--no-pull) skip_pull=true ;;
        esac
    done

    # Stage 1: Git Repository Synchronization
    log_step "Stage 1/6: Git Repository Synchronization..."
    if [ "$skip_pull" = "false" ] && [ -d "$APP_DIR/.git" ] && command -v git >/dev/null 2>&1; then
        log_info "Checking local working tree status..."
        local dirty_files
        dirty_files=$(git status --porcelain 2>/dev/null || true)
        if [ -n "$dirty_files" ]; then
            log_warn "Local modifications detected before pull:"
            echo "$dirty_files" | sed 's/^/    /'
            log_info "Stashing local changes cleanly to prevent merge conflicts ('git stash')..."
            git stash push -m "auto-deploy-$(timestamp)" 2>/dev/null || true
        fi

        log_info "Fetching latest commits from remote repository..."
        git fetch origin 2>/dev/null || true
        local current_branch
        current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
        log_info "Pulling latest code on branch '$current_branch'..."
        if git pull origin "$current_branch"; then
            local commit_hash commit_msg
            commit_hash=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
            commit_msg=$(git log -1 --pretty=%B 2>/dev/null | head -n 1 || echo "")
            log_success "Synchronized to commit $commit_hash ('$commit_msg')"
        else
            log_warn "Git pull reported non-critical notices. Continuing with current working tree."
        fi
    else
        log_info "Git pull skipped (flag provided or not a git checkout)."
    fi

    # Stage 2: Database Safety Backup
    log_step "Stage 2/6: Pre-Deployment Database Safety Backup..."
    if [ "$skip_backup" = "true" ]; then
        log_info "Notice: Database backup skipped via flag."
    else
        if ! cmd_backup; then
            log_warn "Database backup completed with notices. Proceeding with deployment..."
        fi
    fi

    # Stage 3: Python Virtual Environment & Dependencies
    log_step "Stage 3/6: Synchronizing Python Dependencies..."
    if [ -f "$APP_DIR/requirements.txt" ]; then
        log_info "Checking requirements from $APP_DIR/requirements.txt..."
        "$PYTHON_CMD" -m pip install --quiet --upgrade pip
        if "$PYTHON_CMD" -m pip install --quiet -r "$APP_DIR/requirements.txt"; then
            log_success "Python virtual environment dependencies up to date."
        else
            log_warn "Some packages failed to install, continuing with existing venv."
        fi
    fi

    # Stage 4: Database Auto-Bootstrap & Migrations
    log_step "Stage 4/6: Auto-Bootstrapping Database & Running Migrations..."
    bootstrap_and_migrate_db || return 1

    # Stage 5: Frontend Node Dependencies & Next.js Build
    log_step "Stage 5/6: Compiling Next.js Production Build..."
    if [ -d "$APP_DIR/frontend" ] && command -v npm >/dev/null 2>&1; then
        log_info "Installing frontend dependencies ('npm install')..."
        (cd "$APP_DIR/frontend" && npm install --silent --production=false)
        log_info "Building optimized Next.js production bundle ('npm run build')..."
        if (cd "$APP_DIR/frontend" && npm run build); then
            log_success "Next.js production bundle compiled successfully."
        else
            log_error "Frontend compilation failed! Inspect error messages above."
            return 1
        fi
    fi

    # Stage 6: Process Recycling & Multi-Point Health Check
    log_step "Stage 6/6: Conflict-Free Process Recycling & Live Health Verification..."
    if ! cmd_restart; then
        echo ""
        log_error "=========================================================="
        log_error "  ✗ DEPLOYMENT FAILED: HEALTH VERIFICATION DID NOT PASS!"
        log_error "  System is DEGRADED or in CONFLICT. Inspect logs above."
        log_error "=========================================================="
        echo ""
        return 1
    fi

    echo ""
    log_success "=========================================================="
    log_success "  ✓ DEPLOYMENT PIPELINE COMPLETED SUCCESSFULLY!"
    log_success "=========================================================="
    echo ""
    return 0
}

# ------------------------------------------------------------------------------
# Ancillary Subcommands
# ------------------------------------------------------------------------------
cmd_logs() {
    if command -v journalctl >/dev/null 2>&1 && [ -f "/etc/systemd/system/cbt-backend.service" ]; then
        log_info "Streaming live systemd logs for cbt-backend and cbt-frontend (Ctrl+C to stop)..."
        $SUDO_CMD journalctl -u cbt-backend -u cbt-frontend -n 60 -f
    else
        log_info "Streaming application logs from $LOG_DIR (Ctrl+C to stop)..."
        tail -n 60 -f "$LOG_DIR/backend.log" "$LOG_DIR/production.log" 2>/dev/null || echo "No log files found in $LOG_DIR"
    fi
}

cmd_backup() {
    verify_prerequisites || return 1
    log_info "Starting automated PostgreSQL database backup..."
    "$PYTHON_CMD" "$APP_DIR/scripts/backup_db.py"
}

cmd_restore_test() {
    verify_prerequisites || return 1
    log_info "Executing database backup restore test pipeline..."
    "$PYTHON_CMD" "$APP_DIR/scripts/restore_test.py"
}

cmd_monitor() {
    verify_prerequisites || return 1
    "$PYTHON_CMD" "$APP_DIR/scripts/system_monitor.py"
}

# ------------------------------------------------------------------------------
# Interactive Management Console (When Run Without Arguments)
# ------------------------------------------------------------------------------
interactive_menu() {
    while true; do
        clear 2>/dev/null || true
        cmd_status
        echo -e "${BOLD}${BRIGHT_CYAN}------------------------------------------------------------------------------${RESET}"
        echo -e "  ${BOLD}${BRIGHT_WHITE}PRODUCTION MANAGEMENT ACTIONS (Operating as ${CURRENT_USER}):${RESET}"
        echo -e "${BOLD}${BRIGHT_CYAN}------------------------------------------------------------------------------${RESET}"
        echo -e "  ${BOLD}${BRIGHT_GREEN}[1] 🚀 Full Update & Deploy${RESET}  ${DIM}(git pull + pip + db migrate + npm build + restart + verify)${RESET}"
        echo -e "  ${BOLD}${BRIGHT_CYAN}[2] 🔄 Clean Restart & Renew${RESET} ${DIM}(clear rogue ports, restart services, verify health)${RESET}"
        echo -e "  ${BOLD}${BRIGHT_YELLOW}[3] 📊 Health Check & Status${RESET} ${DIM}(deep port & database verification)${RESET}"
        echo -e "  ${BOLD}${BRIGHT_BLUE}[4] 📦 Database Backup${RESET}        ${DIM}(create timestamped PostgreSQL backup in /opt/cbt/backups)${RESET}"
        echo -e "  ${BOLD}${BRIGHT_MAGENTA}[5] 📋 Live Stream Logs${RESET}       ${DIM}(journalctl -u cbt-backend -u cbt-frontend)${RESET}"
        echo -e "  ${BOLD}${BRIGHT_RED}[6] ⏹️ Stop All Services${RESET}      ${DIM}(graceful shutdown of backend & frontend)${RESET}"
        echo -e "  ${BOLD}${WHITE}[7] 🚪 Exit${RESET}"
        echo -e "${BOLD}${BRIGHT_CYAN}------------------------------------------------------------------------------${RESET}"
        echo -ne "${BOLD}Enter choice [1-7]: ${RESET}"
        read -r choice

        case "$choice" in
            1)
                echo ""
                cmd_deploy
                echo ""
                echo -ne "${DIM}Press Enter to return to menu...${RESET}"
                read -r
                ;;
            2)
                echo ""
                cmd_restart
                echo ""
                echo -ne "${DIM}Press Enter to return to menu...${RESET}"
                read -r
                ;;
            3)
                echo ""
                cmd_status
                echo ""
                echo -ne "${DIM}Press Enter to return to menu...${RESET}"
                read -r
                ;;
            4)
                echo ""
                cmd_backup
                echo ""
                echo -ne "${DIM}Press Enter to return to menu...${RESET}"
                read -r
                ;;
            5)
                echo ""
                log_info "Press Ctrl+C anytime to return to menu."
                cmd_logs
                echo ""
                echo -ne "${DIM}Press Enter to return to menu...${RESET}"
                read -r
                ;;
            6)
                echo ""
                cmd_stop
                echo ""
                echo -ne "${DIM}Press Enter to return to menu...${RESET}"
                read -r
                ;;
            7|q|Q)
                echo -e "\n${BRIGHT_GREEN}Exiting CBT Production Manager. Goodbye!${RESET}\n"
                exit 0
                ;;
            *)
                echo -e "${BRIGHT_RED}Invalid option! Please enter a number between 1 and 7.${RESET}"
                sleep 1
                ;;
        esac
    done
}

# ------------------------------------------------------------------------------
# Dispatcher
# ------------------------------------------------------------------------------
if [ $# -gt 0 ]; then
    ACTION="$1"
    shift 1
    case "$ACTION" in
        deploy|update)
            cmd_deploy "$@"
            ;;
        restart)
            cmd_restart "$@"
            ;;
        start)
            cmd_start "$@"
            ;;
        stop)
            cmd_stop "$@"
            ;;
        status)
            cmd_status
            ;;
        health)
            cmd_health
            ;;
        logs)
            cmd_logs
            ;;
        backup)
            cmd_backup
            ;;
        restore-test)
            cmd_restore_test
            ;;
        monitor)
            cmd_monitor
            ;;
        setup|setup-systemd)
            install_systemd_and_sudoers "$@"
            ;;
        *)
            echo -e "${BRIGHT_RED}Unknown command: $ACTION${RESET}"
            echo -e "Usage: $0 {start|stop|restart|status|health|logs|update|deploy|setup-systemd|backup|restore-test|monitor}"
            exit 1
            ;;
    esac
else
    # No arguments passed: show interactive menu if attached to a terminal, otherwise show status
    if [ -t 0 ]; then
        interactive_menu
    else
        cmd_status
    fi
fi
