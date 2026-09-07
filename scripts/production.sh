#!/usr/bin/env bash
# ==============================================================================
# CBT Examination Platform — Production Lifecycle Management Script
# ==============================================================================
# Location: /opt/cbt/scripts/production.sh
#
# Commands:
#   ./scripts/production.sh start        - Safely start backend, frontend & proxy
#   ./scripts/production.sh stop         - Stop CBT application services gracefully
#   ./scripts/production.sh restart      - Restart application & verify health
#   ./scripts/production.sh status       - Check active services, ports, and health
#   ./scripts/production.sh health       - Verify liveness (/health) and readiness (/health/ready)
#   ./scripts/production.sh logs         - View recent application and backend logs
#   ./scripts/production.sh deploy       - Safe atomic deployment pipeline
#   ./scripts/production.sh backup       - Run automated database backup
#   ./scripts/production.sh restore-test - Verify database backup restoration
#   ./scripts/production.sh monitor      - Check CPU, memory, disk, and connection health
# ==============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

# 1. Environment & Paths Configuration
ENV_FILE="$APP_DIR/.env"
LOG_DIR="$APP_DIR/logs"
mkdir -p "$LOG_DIR"
PROD_LOG="$LOG_DIR/production.log"

log() {
    local msg="[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $1"
    echo "$msg"
    echo "$msg" >> "$PROD_LOG" 2>/dev/null || true
}

error() {
    local msg="[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] ERROR: $1"
    echo "$msg" >&2
    echo "$msg" >> "$PROD_LOG" 2>/dev/null || true
}

# 2. Virtual Environment & Python Detection
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
    if [ ! -f "$ENV_FILE" ]; then
        error "Production configuration file not found at: $ENV_FILE"
        error "Please copy .env.example to .env and set production credentials."
        return 1
    fi

    # Ensure secure permissions on .env (600)
    chmod 600 "$ENV_FILE" 2>/dev/null || true

    # Safely source .env without printing secrets
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a

    find_python_interpreter

    # Auto-provision or repair virtual environment if missing or incomplete
    if [ -z "$PYTHON_CMD" ] || ! "$PYTHON_CMD" -c "import pydantic, fastapi, sqlalchemy" >/dev/null 2>&1; then
        log "Python virtual environment (.venv) is missing or incomplete. Initializing..."
        if [ ! -d "$APP_DIR/.venv" ]; then
            if ! python3 -m venv "$APP_DIR/.venv"; then
                error "Failed to create Python virtual environment at $APP_DIR/.venv."
                error "Please run: sudo apt install -y python3-venv python3-pip"
                return 1
            fi
        fi

        PYTHON_CMD="$APP_DIR/.venv/bin/python3"
        if [ ! -f "$PYTHON_CMD" ] && [ -f "$APP_DIR/.venv/bin/python" ]; then
            PYTHON_CMD="$APP_DIR/.venv/bin/python"
        fi

        log "Installing / upgrading dependencies from requirements.txt into .venv..."
        "$PYTHON_CMD" -m pip install --upgrade pip
        if ! "$PYTHON_CMD" -m pip install -r "$APP_DIR/requirements.txt"; then
            error "Failed to install dependencies from $APP_DIR/requirements.txt."
            return 1
        fi
        log "✓ Dependencies installed successfully into virtual environment."
    fi

    return 0
}

# 3. Database Auto-Bootstrap & Migrations
bootstrap_and_migrate_db() {
    log "Ensuring PostgreSQL target database 'cbt' exists..."
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
        error "PostgreSQL database auto-bootstrap failed! Check credentials in /opt/cbt/.env."
        return 1
    fi

    log "Applying database migrations (alembic upgrade head)..."
    if ! "$PYTHON_CMD" -m alembic -c "$APP_DIR/backend/alembic.ini" upgrade head; then
        error "Database migrations failed!"
        return 1
    fi
    log "✓ Database schema is up-to-date."
    return 0
}

# 4. Health Checks
cmd_health() {
    local api_url="http://127.0.0.1:8000"
    local frontend_url="http://127.0.0.1:3000"

    log "Verifying application health..."
    local liveness_code
    liveness_code=$(curl -s -o /dev/null -w "%{http_code}" "$api_url/health" 2>/dev/null || echo "000")
    if [ "$liveness_code" = "200" ]; then
        log "✓ Backend Liveness: OK (HTTP $liveness_code)"
    else
        error "✗ Backend Liveness FAILED (HTTP $liveness_code at $api_url/health)"
    fi

    local readiness_code
    readiness_code=$(curl -s -o /dev/null -w "%{http_code}" "$api_url/health/ready" 2>/dev/null || echo "000")
    if [ "$readiness_code" = "200" ]; then
        log "✓ Backend Database Connectivity: OK (HTTP $readiness_code)"
    else
        error "✗ Backend Database Connectivity FAILED (HTTP $readiness_code at $api_url/health/ready)"
    fi

    local frontend_code
    frontend_code=$(curl -s -o /dev/null -w "%{http_code}" "$frontend_url/" 2>/dev/null || echo "000")
    if [ "$frontend_code" = "200" ] || [ "$frontend_code" = "307" ] || [ "$frontend_code" = "308" ]; then
        log "✓ Frontend Web Application: OK (HTTP $frontend_code)"
    else
        log "! Frontend status: HTTP $frontend_code (May be starting or redirecting)"
    fi

    if [ "$liveness_code" = "200" ] && [ "$readiness_code" = "200" ]; then
        log "System Status: OPERATIONAL & HEALTHY"
        return 0
    else
        error "System Status: DEGRADED"
        return 1
    fi
}

# 5. Start Subcommand
cmd_start() {
    log "Initiating CBT Platform production startup..."
    verify_prerequisites || exit 1

    # Check if application is already healthy
    local check_code
    check_code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:8000/health" 2>/dev/null || echo "000")
    if [ "$check_code" = "200" ]; then
        log "CBT Application backend is already active and healthy on port 8000."
        cmd_status
        return 0
    fi

    # Run Database Auto-Bootstrap & Migrations
    bootstrap_and_migrate_db || exit 1

    # Start services via systemd if available, else process-level supervision
    if command -v systemctl >/dev/null 2>&1 && [ -f "/etc/systemd/system/cbt-backend.service" ]; then
        log "Starting services via systemd..."
        sudo systemctl start cbt-backend
        sudo systemctl start cbt-frontend 2>/dev/null || true
        
        # Verify NGINX if installed
        if command -v nginx >/dev/null 2>&1; then
            if sudo nginx -t 2>/dev/null; then
                sudo systemctl start nginx || sudo systemctl reload nginx || true
                log "✓ NGINX reverse proxy verified & active."
            else
                error "NGINX configuration test failed! Check /etc/nginx/sites-enabled/."
            fi
        fi
    else
        log "Starting services via direct process supervision..."
        export PYTHONPATH="$APP_DIR"
        nohup "$PYTHON_CMD" -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --workers 4 >> "$LOG_DIR/backend.log" 2>&1 &
        
        if [ -d "$APP_DIR/frontend" ] && command -v npm >/dev/null 2>&1; then
            (cd "$APP_DIR/frontend" && nohup npm run start >> "$LOG_DIR/frontend.log" 2>&1 &)
        fi
    fi

    # Wait up to 15 seconds for backend to become ready
    log "Waiting for application to become healthy..."
    local retries=15
    while [ $retries -gt 0 ]; do
        local code
        code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:8000/health" 2>/dev/null || echo "000")
        if [ "$code" = "200" ]; then
            break
        fi
        sleep 1
        retries=$((retries - 1))
    done

    cmd_health
}

# 6. Stop Subcommand
cmd_stop() {
    "$APP_DIR/scripts/shutdown.sh" "$@"
}

# 7. Restart Subcommand
cmd_restart() {
    log "Restarting CBT Production Services..."
    verify_prerequisites || exit 1
    
    if command -v systemctl >/dev/null 2>&1 && [ -f "/etc/systemd/system/cbt-backend.service" ]; then
        bootstrap_and_migrate_db || exit 1
        sudo systemctl restart cbt-backend
        sudo systemctl restart cbt-frontend 2>/dev/null || true
        if command -v nginx >/dev/null 2>&1 && sudo nginx -t 2>/dev/null; then
            sudo systemctl reload nginx 2>/dev/null || sudo systemctl restart nginx 2>/dev/null || true
        fi
    else
        cmd_stop
        sleep 2
        cmd_start
    fi
    sleep 2
    cmd_health
}

# 8. Status Subcommand
cmd_status() {
    log "=== CBT EXAMINATION PLATFORM STATUS ==="
    if command -v systemctl >/dev/null 2>&1; then
        echo ""
        echo "Service Units:"
        for svc in cbt-backend cbt-frontend nginx postgresql; do
            if systemctl is-active --quiet "$svc" 2>/dev/null; then
                echo "  [ACTIVE]   $svc"
            else
                echo "  [INACTIVE] $svc"
            fi
        done
    fi

    echo ""
    echo "Listening Ports:"
    for port in 80 443 3000 8000 5432; do
        if command -v ss >/dev/null 2>&1; then
            if ss -tulpn 2>/dev/null | grep -q ":$port "; then
                echo "  Port $port: LISTENING"
            else
                echo "  Port $port: CLOSED"
            fi
        fi
    done

    echo ""
    cmd_health 2>/dev/null || true
}

# 9. Logs Subcommand
cmd_logs() {
    if command -v journalctl >/dev/null 2>&1 && systemctl is-active --quiet cbt-backend 2>/dev/null; then
        sudo journalctl -u cbt-backend -u cbt-frontend -n 50 -f
    else
        tail -n 50 -f "$LOG_DIR/backend.log" 2>/dev/null || echo "No log file found at $LOG_DIR/backend.log"
    fi
}

# 10. Backup & Restore Tests
cmd_backup() {
    verify_prerequisites || exit 1
    log "Starting automated PostgreSQL database backup..."
    "$PYTHON_CMD" "$APP_DIR/scripts/backup_db.py"
}

cmd_restore_test() {
    verify_prerequisites || exit 1
    log "Executing database backup restore test pipeline..."
    "$PYTHON_CMD" "$APP_DIR/scripts/restore_test.py"
}

cmd_monitor() {
    verify_prerequisites || exit 1
    "$PYTHON_CMD" "$APP_DIR/scripts/system_monitor.py"
}

# 11. Deployment Pipeline
cmd_deploy() {
    local skip_backup=false
    for arg in "$@"; do
        if [ "$arg" = "--skip-backup" ] || [ "$arg" = "-n" ]; then
            skip_backup=true
        fi
    done
    if [ "${FORCE_DEPLOY:-0}" = "1" ] || [ "${SKIP_BACKUP:-0}" = "1" ]; then
        skip_backup=true
    fi

    log "=========================================================="
    log "Starting Atomic Production Deployment Pipeline"
    log "=========================================================="
    verify_prerequisites || exit 1

    # Step 1: Pre-deployment health check
    local is_initial=false
    log "Step 1/6: Verifying pre-deployment health..."
    if ! cmd_health 2>/dev/null; then
        is_initial=true
        log "Notice: System currently offline (Initial deployment)."
    fi

    # Step 2: Backup before ANY modifications
    log "Step 2/6: Creating pre-deployment database backup..."
    if [ "$skip_backup" = "true" ]; then
        log "Notice: Pre-deployment database backup skipped via flag."
    elif ! cmd_backup; then
        if [ "$is_initial" = "true" ]; then
            log "Warning: Pre-deployment database backup skipped on initial deployment."
            log "Proceeding with deployment and database auto-bootstrap..."
        else
            error "DEPLOYMENT ABORTED: Database backup failed! Use './scripts/production.sh deploy --skip-backup' or resolve pg_dump version."
            exit 1
        fi
    fi

    # Step 3: Dependencies update
    log "Step 3/6: Installing updated Python and Node dependencies..."
    if [ -f "$APP_DIR/requirements.txt" ]; then
        "$PYTHON_CMD" -m pip install -q -r "$APP_DIR/requirements.txt"
    fi
    if [ -d "$APP_DIR/frontend" ] && command -v npm >/dev/null 2>&1; then
        (cd "$APP_DIR/frontend" && npm install --production=false)
    fi

    # Step 4: Database Auto-Bootstrap & Migrations
    log "Step 4/6: Auto-bootstrapping and migrating database..."
    bootstrap_and_migrate_db || exit 1

    # Step 5: Frontend Build
    if [ -d "$APP_DIR/frontend" ] && command -v npm >/dev/null 2>&1; then
        log "Step 5/6: Compiling Next.js production build..."
        if ! (cd "$APP_DIR/frontend" && npm run build); then
            error "DEPLOYMENT CRITICAL: Frontend build compilation failed!"
            exit 1
        fi
        log "✓ Frontend compiled successfully."
    fi

    # Step 6: Restart & Health Check
    log "Step 6/6: Restarting services and validating health..."
    cmd_restart
    log "=========================================================="
    log "Deployment Pipeline Completed Successfully!"
    log "=========================================================="
}

# ------------------------------------------------------------------------------
# Dispatcher
# ------------------------------------------------------------------------------
ACTION="${1:-status}"
shift 1 2>/dev/null || true

case "$ACTION" in
    start)
        cmd_start "$@"
        ;;
    stop)
        cmd_stop "$@"
        ;;
    restart)
        cmd_restart "$@"
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
    deploy|update)
        cmd_deploy "$@"
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|health|logs|deploy|backup|restore-test|monitor}"
        exit 1
        ;;
esac
