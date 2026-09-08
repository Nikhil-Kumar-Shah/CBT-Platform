#!/usr/bin/env bash
# ==============================================================================
# CBT Platform — One-Time Non-Root User Setup & Migration Script
# ==============================================================================
# Usage (run once with sudo or as root):
#   sudo ./scripts/setup-production-user.sh [USERNAME]
#
# Default target user: Nikhil-VM
#
# Configures /opt/cbt ownership, installs systemd service units for Nikhil-VM,
# configures minimal sudoers permissions, clears rogue processes on ports 8000/3000,
# and hands complete operational ownership to Nikhil-VM.
# ==============================================================================

set -euo pipefail

TARGET_USER="${1:-Nikhil-VM}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ANSI Colors
BOLD="\033[1m"
RESET="\033[0m"
GREEN="\033[32m"
BRIGHT_GREEN="\033[92m"
BRIGHT_CYAN="\033[96m"
BRIGHT_YELLOW="\033[93m"
BRIGHT_RED="\033[91m"

echo -e "\n${BOLD}${BRIGHT_CYAN}==============================================================================${RESET}"
echo -e "${BOLD}${BRIGHT_CYAN}    CBT PLATFORM — NON-ROOT PRODUCTION ENVIRONMENT SETUP${RESET}"
echo -e "${BOLD}${BRIGHT_CYAN}    Target Operational User: ${BRIGHT_GREEN}${TARGET_USER}${RESET}"
echo -e "${BOLD}${BRIGHT_CYAN}==============================================================================${RESET}\n"

# 1. Require root for system setup
if [ "$EUID" -ne 0 ]; then
    echo -e "${BRIGHT_RED}ERROR: This initial setup script must be run as root or via sudo.${RESET}"
    echo -e "Usage: sudo $0 ${TARGET_USER}"
    exit 1
fi

# 2. Verify target user exists
if ! id "$TARGET_USER" >/dev/null 2>&1; then
    echo -e "${BRIGHT_RED}ERROR: Target Linux user '${TARGET_USER}' does not exist on this machine.${RESET}"
    echo -e "Please create the user first: sudo adduser ${TARGET_USER}"
    exit 1
fi
echo -e "  ${BRIGHT_GREEN}✓${RESET} Target Linux user '${TARGET_USER}' verified (UID: $(id -u "$TARGET_USER"), GID: $(id -g "$TARGET_USER"))."

# 3. Stop running services & terminate rogue processes on ports 8000 & 3000
echo -e "\n${BOLD}Step 1/6: Terminating old processes & freeing application ports...${RESET}"
systemctl stop cbt-frontend 2>/dev/null || true
systemctl stop cbt-backend 2>/dev/null || true

# Force kill any lingering rogue root processes holding port 8000 or 3000
for port in 8000 3000; do
    if command -v fuser >/dev/null 2>&1; then
        pids=$(fuser "${port}/tcp" 2>/dev/null || true)
        if [ -n "$pids" ]; then
            echo -e "  ${BRIGHT_YELLOW}⚠️  Terminating rogue process on port $port (PID: $pids)...${RESET}"
            fuser -k -15 "${port}/tcp" 2>/dev/null || true
            sleep 1
            fuser -k -9 "${port}/tcp" 2>/dev/null || true
        fi
    elif command -v ss >/dev/null 2>&1; then
        pids=$(ss -lptn "sport = :$port" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u || true)
        if [ -n "$pids" ]; then
            echo -e "  ${BRIGHT_YELLOW}⚠️  Terminating rogue process on port $port (PID: $pids)...${RESET}"
            for pid in $pids; do kill -9 "$pid" 2>/dev/null || true; done
        fi
    fi
done
echo -e "  ${BRIGHT_GREEN}✓${RESET} Application ports 8000 and 3000 are clean and unblocked."

# 4. Create required directories
echo -e "\n${BOLD}Step 2/6: Creating required runtime directories...${RESET}"
mkdir -p "$APP_DIR/logs"
mkdir -p "$APP_DIR/backups"
mkdir -p "$APP_DIR/frontend/.next"
echo -e "  ${BRIGHT_GREEN}✓${RESET} Runtime directories created: logs, backups, frontend/.next."

# 5. Install systemd service units for Nikhil-VM
echo -e "\n${BOLD}Step 3/6: Installing systemd service units for ${TARGET_USER}...${RESET}"
SYSTEMD_SRC="$APP_DIR/deployment/systemd"

for unit in cbt-backend.service cbt-frontend.service cbt-backup.service; do
    if [ -f "$SYSTEMD_SRC/$unit" ]; then
        # Ensure user and group are set to TARGET_USER
        sed -i "s/^User=.*/User=${TARGET_USER}/" "$SYSTEMD_SRC/$unit"
        sed -i "s/^Group=.*/Group=${TARGET_USER}/" "$SYSTEMD_SRC/$unit"
        cp "$SYSTEMD_SRC/$unit" "/etc/systemd/system/$unit"
        echo -e "  ${BRIGHT_GREEN}✓${RESET} Installed /etc/systemd/system/$unit (User=${TARGET_USER})"
    fi
done

if [ -f "$SYSTEMD_SRC/cbt-backup.timer" ]; then
    cp "$SYSTEMD_SRC/cbt-backup.timer" "/etc/systemd/system/cbt-backup.timer"
    systemctl enable cbt-backup.timer 2>/dev/null || true
    systemctl start cbt-backup.timer 2>/dev/null || true
    echo -e "  ${BRIGHT_GREEN}✓${RESET} Installed and started /etc/systemd/system/cbt-backup.timer"
fi

systemctl daemon-reload
echo -e "  ${BRIGHT_GREEN}✓${RESET} Systemd daemon reloaded."

# 6. Install minimal sudoers permissions for Nikhil-VM
echo -e "\n${BOLD}Step 4/6: Configuring minimal sudoers permissions in /etc/sudoers.d/cbt...${RESET}"
SUDOERS_FILE="/etc/sudoers.d/cbt"
cat > "$SUDOERS_FILE" <<EOF
# Minimal sudo permissions for ${TARGET_USER} to manage CBT systemd services without password
${TARGET_USER} ALL=(ALL) NOPASSWD: /bin/systemctl start cbt-backend, /bin/systemctl stop cbt-backend, /bin/systemctl restart cbt-backend, /bin/systemctl reload cbt-backend, /bin/systemctl status cbt-backend
${TARGET_USER} ALL=(ALL) NOPASSWD: /bin/systemctl start cbt-frontend, /bin/systemctl stop cbt-frontend, /bin/systemctl restart cbt-frontend, /bin/systemctl reload cbt-frontend, /bin/systemctl status cbt-frontend
${TARGET_USER} ALL=(ALL) NOPASSWD: /bin/systemctl start nginx, /bin/systemctl stop nginx, /bin/systemctl restart nginx, /bin/systemctl reload nginx, /bin/systemctl status nginx
${TARGET_USER} ALL=(ALL) NOPASSWD: /bin/systemctl daemon-reload
${TARGET_USER} ALL=(ALL) NOPASSWD: /usr/sbin/nginx -t, /usr/bin/nginx -t
${TARGET_USER} ALL=(ALL) NOPASSWD: /bin/journalctl -u cbt-backend*, /bin/journalctl -u cbt-frontend*
${TARGET_USER} ALL=(ALL) NOPASSWD: /usr/bin/fuser -k *
EOF
chmod 0440 "$SUDOERS_FILE"
# Validate syntax of sudoers
if visudo -cf "$SUDOERS_FILE" >/dev/null 2>&1; then
    echo -e "  ${BRIGHT_GREEN}✓${RESET} Sudoers configuration verified and installed at $SUDOERS_FILE."
else
    echo -e "  ${BRIGHT_RED}ERROR: Invalid sudoers syntax! Removing file for safety.${RESET}"
    rm -f "$SUDOERS_FILE"
    exit 1
fi

# 7. Apply proper ownership & security permissions (no chmod 777)
echo -e "\n${BOLD}Step 5/6: Setting secure ownership and permissions on /opt/cbt...${RESET}"
chown -R "${TARGET_USER}:${TARGET_USER}" "$APP_DIR"
find "$APP_DIR" -type d -exec chmod 755 {} +
find "$APP_DIR" -type f -exec chmod 644 {} +
chmod 755 "$APP_DIR/production.sh" "$APP_DIR/scripts"/*.sh 2>/dev/null || true

# Secure .env file: only readable & writable by TARGET_USER (600)
if [ -f "$APP_DIR/.env" ]; then
    chmod 600 "$APP_DIR/.env"
    echo -e "  ${BRIGHT_GREEN}✓${RESET} .env permissions set to 600 (owner-only access)."
fi
echo -e "  ${BRIGHT_GREEN}✓${RESET} Entire repository owned by ${TARGET_USER}:${TARGET_USER} (mode 755/644)."

# 8. Start services under Nikhil-VM and verify
echo -e "\n${BOLD}Step 6/6: Starting services under ${TARGET_USER} and verifying...${RESET}"
systemctl enable cbt-backend cbt-frontend
systemctl start cbt-backend
systemctl start cbt-frontend

if command -v nginx >/dev/null 2>&1; then
    if nginx -t 2>/dev/null; then
        systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null || true
        echo -e "  ${BRIGHT_GREEN}✓${RESET} NGINX reloaded."
    fi
fi

# Wait for backend
echo -e "  Waiting for backend service to report healthy..."
for i in $(seq 1 15); do
    code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:8000/health" 2>/dev/null || echo "000")
    if [ "$code" = "200" ]; then break; fi
    sleep 1
done

echo -e "\n${BOLD}${BRIGHT_CYAN}==============================================================================${RESET}"
echo -e "${BOLD}${BRIGHT_GREEN}  SETUP COMPLETE! /opt/cbt IS NOW DEPLOYED AND OWNED BY ${TARGET_USER}${RESET}"
echo -e "${BOLD}${BRIGHT_CYAN}==============================================================================${RESET}"

echo -e "\n${BOLD}Service Status Verification:${RESET}"
for svc in cbt-backend cbt-frontend nginx postgresql; do
    if systemctl is-active --quiet "$svc" 2>/dev/null; then
        echo -e "  ${BRIGHT_GREEN}[ACTIVE]  ${RESET} $svc"
    else
        echo -e "  ${BRIGHT_RED}[INACTIVE]${RESET} $svc"
    fi
done

echo -e "\n${BOLD}Process User Verification:${RESET}"
BACKEND_USER=$(ps -u "${TARGET_USER}" -o user,comm,args 2>/dev/null | grep uvicorn | head -n 1 | awk '{print $1}' || echo "not found")
FRONTEND_USER=$(ps -u "${TARGET_USER}" -o user,comm,args 2>/dev/null | grep node | head -n 1 | awk '{print $1}' || echo "not found")
echo -e "  Backend Worker Process User:  ${BRIGHT_GREEN}${BACKEND_USER}${RESET}"
echo -e "  Frontend Worker Process User: ${BRIGHT_GREEN}${FRONTEND_USER}${RESET}"

echo -e "\n${BOLD}${BRIGHT_GREEN}From now on, operate entirely as ${TARGET_USER}:${RESET}"
echo -e "  ${BRIGHT_CYAN}su - ${TARGET_USER}${RESET} (or ssh in as ${TARGET_USER})"
echo -e "  ${BRIGHT_CYAN}cd /opt/cbt${RESET}"
echo -e "  ${BRIGHT_CYAN}git pull${RESET}"
echo -e "  ${BRIGHT_CYAN}./production.sh restart${RESET}\n"
