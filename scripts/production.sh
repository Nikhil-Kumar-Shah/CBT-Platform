#!/usr/bin/env bash
# ==============================================================================
# CBT Examination Platform — Professional Production Lifecycle Controller
# ==============================================================================
# Location: /opt/cbt/scripts/production.sh
# Target Operational User: Nikhil-VM (Non-Root)
#
# Commands:
#   ./production.sh              - Interactive Management Console (Menu)
#   ./production.sh update       - Full 6-stage Atomic Pipeline (git pull, pip, db, build, restart, verify)
#   ./production.sh deploy       - Alias for 'update'
#   ./production.sh restart      - Clear rogue port conflicts, restart systemd units, verify health
#   ./production.sh start        - Start all application services safely
#   ./production.sh stop         - Graceful shutdown of application services
#   ./production.sh status       - Display live status of services, ports, and health
#   ./production.sh health       - Multi-point liveness, readiness & proxy verification
#   ./production.sh logs         - Stream live backend & frontend logs
#   ./production.sh backup       - Automated compressed database backup
#   ./production.sh restore-test - Test restore pipeline in temporary schema
#   ./production.sh monitor      - Host resources, memory, disk, and connection metrics
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

verify_prerequisites() {
    # 1. Auto-create runtime directories
    mkdir -p "$APP_DIR/logs" "$APP_DIR/backups" "$APP_DIR/frontend/.next"
    fix_permissions

    # 2. Check and auto-provision systemd units & sudoers if missing
    if command -v systemctl >/dev/null 2>&1 && [ ! -f "/etc/systemd/system/cbt-backend.service" ]; then
        if [ -f "$APP_DIR/scripts/setup-production-user.sh" ]; then
            log_warn "Systemd service units are not yet installed in /etc/systemd/system/."
            if [ "$EUID" -eq 0 ]; then
                log_info "Installing systemd units and sudoers configuration as root..."
                "$APP_DIR/scripts/setup-production-user.sh" "$DEPLOY_USER" || true
            elif command -v sudo >/dev/null 2>&1; then
                log_info "Prompting sudo to install systemd units and sudoers configuration..."
                sudo "$APP_DIR/scripts/setup-production-user.sh" "$DEPLOY_USER" || true
            fi
        fi
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
# Port Conflict Resolution Helper
# ------------------------------------------------------------------------------
free_port() {
    local port="$1"
    local name="${2:-service}"

    if command -v fuser >/dev/null 2>&1; then
        local pids
        pids=$(fuser "${port}/tcp" 2>/dev/null || true)
        if [ -n "$pids" ]; then
            log_warn "Port $port ($name) is held by PID(s): $pids. Clearing for clean start..."
            $SUDO_CMD fuser -k -15 "${port}/tcp" 2>/dev/null || true
            sleep 1
            $SUDO_CMD fuser -k -9 "${port}/tcp" 2>/dev/null || true
        fi
    elif command -v ss >/dev/null 2>&1; then
        local pids
        pids=$(ss -lptn "sport = :$port" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u || true)
        if [ -n "$pids" ]; then
            log_warn "Port $port ($name) is held by PID(s): $pids. Terminating..."
            for pid in $pids; do
                $SUDO_CMD kill -15 "$pid" 2>/dev/null || true
            done
            sleep 1
            for pid in $pids; do
                $SUDO_CMD kill -9 "$pid" 2>/dev/null || true
            done
        fi
    fi
}

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
# Backend Service & Process Health Inspector (Solves Contradictory Status Bug)
# ------------------------------------------------------------------------------
check_backend_status() {
    # Returns:
    #   0: Healthy (systemd unit active AND port 8000 listening)
    #   1: Inactive / Stopped (systemd unit inactive and port 8000 closed)
    #   2: Critical Conflict (Port 8000 listening by rogue process, but systemd unit is INACTIVE)
    #   3: Starting (systemd unit active, waiting for port 8000)
    local service_active=false
    local port_listening=false
    LISTENER_PID=""
    LISTENER_USER=""
    LISTENER_CMD=""

    if command -v systemctl >/dev/null 2>&1; then
        if systemctl is-active --quiet cbt-backend 2>/dev/null; then
            service_active=true
        fi
    fi

    if command -v ss >/dev/null 2>&1; then
        if ss -tulpn 2>/dev/null | grep -q ":8000 "; then
            port_listening=true
            LISTENER_PID=$(ss -lptn "sport = :8000" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -n 1 || true)
            if [ -n "$LISTENER_PID" ]; then
                LISTENER_USER=$(ps -o user= -p "$LISTENER_PID" 2>/dev/null | tr -d ' ' || echo "unknown")
                LISTENER_CMD=$(ps -o comm= -p "$LISTENER_PID" 2>/dev/null | tr -d ' ' || echo "unknown")
            fi
        fi
    fi

    if [ "$service_active" = "true" ] && [ "$port_listening" = "true" ]; then
        return 0
    elif [ "$service_active" = "false" ] && [ "$port_listening" = "true" ]; then
        return 2
    elif [ "$service_active" = "true" ] && [ "$port_listening" = "false" ]; then
        return 3
    else
        return 1
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
# Health Checks & Status
# ------------------------------------------------------------------------------
cmd_health() {
    local api_url="http://127.0.0.1:8000"
    local frontend_url="http://127.0.0.1:3000"

    echo ""
    echo -e "${BOLD}${BRIGHT_WHITE}================== SYSTEM HEALTH VERIFICATION ==================${RESET}"

    local backend_state=0
    check_backend_status && backend_state=$? || backend_state=$?

    if [ "$backend_state" -eq 2 ]; then
        echo -e "  ${BRIGHT_RED}✗ Backend Service Conflict:${RESET} cbt-backend.service is INACTIVE but port 8000 is occupied by rogue PID ${LISTENER_PID} (${LISTENER_USER})!"
        echo -e "    ${BRIGHT_YELLOW}Run './production.sh restart' to terminate the rogue process and start cbt-backend.${RESET}"
    elif [ "$backend_state" -eq 1 ]; then
        echo -e "  ${BRIGHT_RED}✗ Backend Service:${RESET}          cbt-backend.service is INACTIVE (Port 8000 is closed)"
    fi

    local liveness_code
    liveness_code=$(curl -s -o /dev/null -w "%{http_code}" "$api_url/health" 2>/dev/null || echo "000")
    if [ "$liveness_code" = "200" ] && [ "$backend_state" -eq 0 ]; then
        echo -e "  ${BRIGHT_GREEN}✓ Backend Liveness:${RESET}           HTTP 200 (Active on port 8000, PID: ${LISTENER_PID:-systemd})"
    elif [ "$liveness_code" = "200" ] && [ "$backend_state" -eq 2 ]; then
        echo -e "  ${BRIGHT_YELLOW}! Backend Liveness:${RESET}           HTTP 200 (Served by ROGUE PROCESS PID ${LISTENER_PID}, NOT systemd!)"
    else
        echo -e "  ${BRIGHT_RED}✗ Backend Liveness:${RESET}           HTTP $liveness_code (Failed at $api_url/health)"
    fi

    local readiness_code
    readiness_code=$(curl -s -o /dev/null -w "%{http_code}" "$api_url/health/ready" 2>/dev/null || echo "000")
    if [ "$readiness_code" = "200" ]; then
        echo -e "  ${BRIGHT_GREEN}✓ Database Connectivity:${RESET}      HTTP 200 (PostgreSQL Online & Responsive)"
    else
        echo -e "  ${BRIGHT_RED}✗ Database Connectivity:${RESET}      HTTP $readiness_code (Failed at $api_url/health/ready)"
    fi

    local frontend_code
    frontend_code=$(curl -s -o /dev/null -w "%{http_code}" "$frontend_url/" 2>/dev/null || echo "000")
    if [ "$frontend_code" = "200" ] || [ "$frontend_code" = "307" ] || [ "$frontend_code" = "308" ]; then
        echo -e "  ${BRIGHT_GREEN}✓ Next.js Frontend:${RESET}           HTTP $frontend_code (Active on port 3000)"
    else
        echo -e "  ${BRIGHT_YELLOW}! Next.js Frontend:${RESET}           HTTP $frontend_code (May be compiling or redirecting)"
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

    if [ "$backend_state" -eq 0 ] && [ "$liveness_code" = "200" ] && [ "$readiness_code" = "200" ]; then
        echo -e "${BOLD}${BG_GREEN} SYSTEM STATUS: OPERATIONAL & HEALTHY ${RESET}"
        return 0
    elif [ "$backend_state" -eq 2 ]; then
        echo -e "${BOLD}${BG_RED} SYSTEM STATUS: CONFLICT / DEGRADED (Rogue Process Detected on Port 8000) ${RESET}"
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
            echo -e "    ${BRIGHT_GREEN}[ACTIVE]  ${RESET} cbt-backend (FastAPI Backend, PID: ${LISTENER_PID:-systemd})"
        elif [ "$backend_state" -eq 2 ]; then
            echo -e "    ${BRIGHT_RED}[INACTIVE]${RESET} cbt-backend ${BRIGHT_RED}(CRITICAL: Port 8000 held by rogue PID ${LISTENER_PID}, User: ${LISTENER_USER})${RESET}"
        else
            echo -e "    ${BRIGHT_RED}[INACTIVE]${RESET} cbt-backend"
        fi

        for svc in cbt-frontend nginx postgresql; do
            if systemctl is-active --quiet "$svc" 2>/dev/null; then
                echo -e "    ${BRIGHT_GREEN}[ACTIVE]  ${RESET} $svc"
            else
                echo -e "    ${BRIGHT_RED}[INACTIVE]${RESET} $svc"
            fi
        done
    else
        echo "    (systemd not available in this environment)"
    fi

    echo ""
    echo -e "  ${BOLD}Listening Ports:${RESET}"
    for port in 80 443 3000 8000 5432; do
        local desc=""
        case "$port" in
            80) desc="HTTP NGINX" ;;
            443) desc="HTTPS NGINX" ;;
            3000) desc="Next.js Frontend" ;;
            8000) desc="FastAPI Backend" ;;
            5432) desc="PostgreSQL Database" ;;
        esac
        if command -v ss >/dev/null 2>&1; then
            if ss -tulpn 2>/dev/null | grep -q ":$port "; then
                echo -e "    Port $port ($desc): ${BRIGHT_GREEN}LISTENING${RESET}"
            else
                echo -e "    Port $port ($desc): ${DIM}CLOSED${RESET}"
            fi
        fi
    done

    cmd_health
}

# ------------------------------------------------------------------------------
# Start Subcommand
# ------------------------------------------------------------------------------
cmd_start() {
    log_header "STARTING CBT EXAMINATION PLATFORM"
    verify_prerequisites || exit 1

    # Check if backend systemd service is already active and healthy
    local backend_state=0
    check_backend_status && backend_state=$? || backend_state=$?
    if [ "$backend_state" -eq 0 ]; then
        log_info "CBT Application backend is already active and healthy on port 8000."
        cmd_status
        return 0
    fi

    # Free any rogue port before starting systemd
    free_port 8000 "FastAPI Backend"
    free_port 3000 "Next.js Frontend"

    bootstrap_and_migrate_db || exit 1
    fix_permissions

    if command -v systemctl >/dev/null 2>&1 && [ -f "/etc/systemd/system/cbt-backend.service" ]; then
        log_info "Starting services via systemd under user '$DEPLOY_USER'..."
        $SUDO_CMD systemctl daemon-reload 2>/dev/null || true
        $SUDO_CMD systemctl start cbt-backend
        $SUDO_CMD systemctl start cbt-frontend 2>/dev/null || true
        
        if command -v nginx >/dev/null 2>&1; then
            if [ ! -f "/etc/nginx/sites-enabled/cbt" ] && [ -f "$APP_DIR/deployment/nginx/cbt.conf" ]; then
                $SUDO_CMD cp "$APP_DIR/deployment/nginx/cbt.conf" /etc/nginx/sites-available/cbt 2>/dev/null || true
                $SUDO_CMD ln -sf /etc/nginx/sites-available/cbt /etc/nginx/sites-enabled/ 2>/dev/null || true
                $SUDO_CMD rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
            fi
            if $SUDO_CMD nginx -t 2>/dev/null; then
                $SUDO_CMD systemctl start nginx || $SUDO_CMD systemctl reload nginx || true
                log_success "NGINX reverse proxy active."
            else
                log_error "NGINX configuration test failed! Check /etc/nginx/sites-enabled/."
            fi
        fi
    else
        log_info "Starting services via direct process supervision..."
        export PYTHONPATH="$APP_DIR"
        nohup "$PYTHON_CMD" -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --workers 4 >> "$LOG_DIR/backend.log" 2>&1 &
        
        if [ -d "$APP_DIR/frontend" ] && command -v npm >/dev/null 2>&1; then
            (cd "$APP_DIR/frontend" && nohup npm run start >> "$LOG_DIR/frontend.log" 2>&1 &)
        fi
    fi

    wait_and_verify_health
}

# ------------------------------------------------------------------------------
# Stop Subcommand
# ------------------------------------------------------------------------------
cmd_stop() {
    log_header "STOPPING CBT EXAMINATION PLATFORM"
    if command -v systemctl >/dev/null 2>&1 && [ -f "/etc/systemd/system/cbt-backend.service" ]; then
        $SUDO_CMD systemctl stop cbt-frontend 2>/dev/null || true
        $SUDO_CMD systemctl stop cbt-backend 2>/dev/null || true
    fi
    free_port 8000 "Backend API"
    free_port 3000 "Frontend Web"
    log_success "All application services stopped safely."
}

# ------------------------------------------------------------------------------
# Restart Subcommand (Clean & Conflict-Free)
# ------------------------------------------------------------------------------
cmd_restart() {
    log_header "RESTARTING CBT EXAMINATION PLATFORM SERVICES"
    verify_prerequisites || exit 1

    log_step "1/4: Ensuring database connectivity & schema migrations..."
    bootstrap_and_migrate_db || exit 1

    log_step "2/4: Terminating old service units and clearing rogue port listeners..."
    if command -v systemctl >/dev/null 2>&1 && [ -f "/etc/systemd/system/cbt-backend.service" ]; then
        $SUDO_CMD systemctl stop cbt-frontend 2>/dev/null || true
        $SUDO_CMD systemctl stop cbt-backend 2>/dev/null || true
    fi
    free_port 8000 "FastAPI Backend"
    free_port 3000 "Next.js Frontend"

    log_step "3/4: Setting file permissions & launching refreshed services..."
    fix_permissions

    if command -v systemctl >/dev/null 2>&1 && [ -f "/etc/systemd/system/cbt-backend.service" ]; then
        $SUDO_CMD systemctl daemon-reload 2>/dev/null || true
        $SUDO_CMD systemctl start cbt-backend
        $SUDO_CMD systemctl start cbt-frontend 2>/dev/null || true

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
    else
        export PYTHONPATH="$APP_DIR"
        nohup "$PYTHON_CMD" -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --workers 4 >> "$LOG_DIR/backend.log" 2>&1 &
        if [ -d "$APP_DIR/frontend" ] && command -v npm >/dev/null 2>&1; then
            (cd "$APP_DIR/frontend" && nohup npm run start >> "$LOG_DIR/frontend.log" 2>&1 &)
        fi
    fi

    log_step "4/4: Multi-point live health verification..."
    wait_and_verify_health
}

# ------------------------------------------------------------------------------
# Deploy / Update Pipeline (6-Stage Comprehensive Automation)
# ------------------------------------------------------------------------------
cmd_deploy() {
    log_header "ATOMIC PRODUCTION UPDATE & DEPLOYMENT PIPELINE"
    verify_prerequisites || exit 1

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
    bootstrap_and_migrate_db || exit 1

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
            exit 1
        fi
    fi

    # Stage 6: Process Recycling & Multi-Point Health Check
    log_step "Stage 6/6: Conflict-Free Process Recycling & Live Health Verification..."
    cmd_restart

    echo ""
    log_success "=========================================================="
    log_success "  ✓ DEPLOYMENT PIPELINE COMPLETED SUCCESSFULLY!"
    log_success "=========================================================="
    echo ""
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
    verify_prerequisites || exit 1
    log_info "Starting automated PostgreSQL database backup..."
    "$PYTHON_CMD" "$APP_DIR/scripts/backup_db.py"
}

cmd_restore_test() {
    verify_prerequisites || exit 1
    log_info "Executing database backup restore test pipeline..."
    "$PYTHON_CMD" "$APP_DIR/scripts/restore_test.py"
}

cmd_monitor() {
    verify_prerequisites || exit 1
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
        *)
            echo -e "${BRIGHT_RED}Unknown command: $ACTION${RESET}"
            echo -e "Usage: $0 {deploy|update|restart|start|stop|status|health|logs|backup|restore-test|monitor}"
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
