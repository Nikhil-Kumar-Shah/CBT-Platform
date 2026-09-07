#!/usr/bin/env bash
# ==============================================================================
# CBT EXAMINATION PLATFORM
# Master Production Activation & Hosting Script (Single Source of Truth)
# ==============================================================================
# Architecture: Next.js (Port 3000) + FastAPI (Port 8000) + PostgreSQL + NGINX (:80/:443)
# Target OS: Ubuntu 22.04 LTS / Ubuntu 24.04 LTS (Debian-compatible)
#
# Usage:
#   sudo bash activate_production.sh
#   sudo bash activate_production.sh --domain cbt.yourdomain.com
#   sudo bash activate_production.sh --skip-deps
# ==============================================================================

set -euo pipefail

# ANSI Text Formatting
BOLD="\033[1m"
GREEN="\033[92m"
YELLOW="\033[93m"
RED="\033[91m"
CYAN="\033[96m"
MAGENTA="\033[95m"
RESET="\033[0m"

APP_USER="cbt"
TARGET_DIR="/opt/cbt"
CONFIG_DIR="/etc/cbt"
LOG_DIR="/var/log/cbt"
SCRIPT_SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Detect public IP address of the virtual machine
DETECTED_IP=$(curl -s -m 4 ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
PUBLIC_IP="${DETECTED_IP}"
DOMAIN=""
SKIP_DEPS=false
AUTO_YES=false

# Parse optional arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --domain|-d)
      DOMAIN="$2"
      shift 2
      ;;
    --skip-deps)
      SKIP_DEPS=true
      shift
      ;;
    -y|--yes)
      AUTO_YES=true
      shift
      ;;
    -h|--help)
      echo "Usage: sudo bash activate_production.sh [--domain cbt.yourdomain.com] [--skip-deps] [-y]"
      exit 0
      ;;
    *)
      if [[ "$1" != -* ]]; then
        DOMAIN="$1"
        shift
      else
        echo "Unknown parameter: $1"
        exit 1
      fi
      ;;
  esac
done

echo -e "\n${CYAN}${BOLD}==============================================================================${RESET}"
echo -e "${CYAN}${BOLD}       CBT EXAMINATION PLATFORM — ONE-CLICK PRODUCTION ACTIVATOR             ${RESET}"
echo -e "${CYAN}${BOLD}==============================================================================${RESET}"
echo -e "Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
echo -e "Detected Server Public IP: ${BOLD}${PUBLIC_IP}${RESET}"

# Prompt for domain if not provided via flags and running interactively
if [ -z "$DOMAIN" ]; then
  if [ -t 0 ] && [ "$AUTO_YES" = false ]; then
    echo -e ""
    echo -e "${YELLOW}${BOLD}Custom Domain Configuration:${RESET}"
    echo -e "Do you have a custom domain pointing to this server (e.g. cbt.example.com)?"
    read -r -p "Enter Domain [or press ENTER to use Public IP ${PUBLIC_IP}]: " INPUT_DOMAIN
    if [ -n "$INPUT_DOMAIN" ]; then
      DOMAIN="$(echo "$INPUT_DOMAIN" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')"
    else
      DOMAIN="${PUBLIC_IP}"
    fi
  else
    DOMAIN="${PUBLIC_IP}"
  fi
fi

echo -e "Active Target Host: ${BOLD}${DOMAIN}${RESET}\n"

# ------------------------------------------------------------------------------
# STEP 1: Root Privilege Verification
# ------------------------------------------------------------------------------
echo -e "${BOLD}[1/10] Verifying Root Privileges...${RESET}"
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[!] ERROR: This activation script must be run as root.${RESET}" >&2
  echo -e "    Please run: ${BOLD}sudo bash activate_production.sh${RESET}" >&2
  exit 1
fi
echo -e "  ${GREEN}[✓]${RESET} Operating with root privileges."

# ------------------------------------------------------------------------------
# STEP 2: System Package & Dependency Installation
# ------------------------------------------------------------------------------
if [ "$SKIP_DEPS" = false ]; then
  echo -e "\n${BOLD}[2/10] Installing System Prerequisites & Runtimes...${RESET}"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y

  # Install system utilities, compilers, NGINX, Certbot, PostgreSQL client & Python tools
  apt-get install -y --no-install-recommends \
    curl \
    wget \
    git \
    build-essential \
    software-properties-common \
    ufw \
    nginx \
    postgresql-client \
    libpq-dev \
    libssl-dev \
    libffi-dev \
    openssl \
    certbot \
    python3-certbot-nginx \
    logrotate \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev

  # Install Node.js 20 LTS if missing or outdated (< 18)
  NEED_NODE=true
  if command -v node &>/dev/null; then
    NODE_MAJOR=$(node -v | cut -d'.' -f1 | tr -d 'v')
    if [ "$NODE_MAJOR" -ge 18 ]; then
      NEED_NODE=false
      echo -e "  ${GREEN}[✓]${RESET} Node.js $(node -v) is already installed."
    fi
  fi

  if [ "$NEED_NODE" = true ]; then
    echo -e "  [*] Installing Node.js 20.x LTS from NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    echo -e "  ${GREEN}[✓]${RESET} Node.js $(node -v) & npm $(npm -v) installed."
  fi
else
  echo -e "\n${BOLD}[2/10] Skipping system packages (--skip-deps active)...${RESET}"
fi

# ------------------------------------------------------------------------------
# STEP 3: Configure Service User & Directory Structure
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[3/10] Configuring Service User ('${APP_USER}') & Directory Permissions...${RESET}"

if ! id -u "$APP_USER" &>/dev/null; then
  echo -e "  [*] Creating dedicated system user: ${APP_USER}..."
  useradd -r -s /bin/bash -d "$TARGET_DIR" "$APP_USER"
fi

mkdir -p "$TARGET_DIR" "$CONFIG_DIR" "$LOG_DIR" /var/www/certbot "$TARGET_DIR/backups" "$TARGET_DIR/logs"
chown -R "$APP_USER:$APP_USER" "$TARGET_DIR" "$CONFIG_DIR" "$LOG_DIR"
chmod 755 "$TARGET_DIR"
chmod 750 "$LOG_DIR"
chmod 700 "$TARGET_DIR/backups"

# Allow git operations in this repository across users
git config --system --add safe.directory "$TARGET_DIR" 2>/dev/null || true

# Synchronize current repository to /opt/cbt if running from another location
if [ "$SCRIPT_SOURCE_DIR" != "$TARGET_DIR" ]; then
  echo -e "  [*] Synchronizing repository to ${TARGET_DIR}..."
  rsync -a --exclude='.venv' --exclude='node_modules' --exclude='.next' --exclude='.git' \
    "$SCRIPT_SOURCE_DIR/" "$TARGET_DIR/"
  chown -R "$APP_USER:$APP_USER" "$TARGET_DIR"
fi
echo -e "  ${GREEN}[✓]${RESET} Application directory ready at ${TARGET_DIR}."

# ------------------------------------------------------------------------------
# STEP 4: Production Configuration & Secrets Validation
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[4/10] Validating Environment Configurations & Cryptographic Secrets...${RESET}"

ENV_FILE="${TARGET_DIR}/.env"

if [ ! -f "$ENV_FILE" ]; then
  if [ -f "${TARGET_DIR}/.env.example" ]; then
    echo -e "  [*] Creating .env from .env.example template..."
    cp "${TARGET_DIR}/.env.example" "$ENV_FILE"
  else
    echo -e "  [*] Generating production environment template..."
    cat > "$ENV_FILE" <<EOF
APP_ENV=production
APP_NAME="CBT Examination Platform"
APP_DEBUG=false

POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_USER=cbt_admin
POSTGRES_PASSWORD=$(openssl rand -hex 16)
POSTGRES_BOOTSTRAP_DATABASE=postgres
POSTGRES_DATABASE=cbt
POSTGRES_SSLMODE=prefer

SECRET_KEY=$(openssl rand -hex 32)
SESSION_COOKIE_NAME=cbt_admin_session
SESSION_COOKIE_SECURE=false

CORS_ORIGINS="http://${DOMAIN},https://${DOMAIN},http://${PUBLIC_IP}"
STORAGE_BACKEND=local
EOF
  fi
fi

# Ensure high-entropy SECRET_KEY is present
if grep -q "change_this_to_a_secure_random_string" "$ENV_FILE" 2>/dev/null || ! grep -q "^SECRET_KEY=" "$ENV_FILE"; then
  NEW_SECRET=$(openssl rand -hex 32)
  if grep -q "^SECRET_KEY=" "$ENV_FILE"; then
    sed -i "s|^SECRET_KEY=.*|SECRET_KEY=${NEW_SECRET}|" "$ENV_FILE"
  else
    echo "SECRET_KEY=${NEW_SECRET}" >> "$ENV_FILE"
  fi
  echo -e "  ${GREEN}[✓]${RESET} Generated secure cryptographic SECRET_KEY."
fi

# Set proper CORS_ORIGINS for the target domain
if grep -q "^CORS_ORIGINS=" "$ENV_FILE"; then
  sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=http://${DOMAIN},https://${DOMAIN},http://${PUBLIC_IP}|" "$ENV_FILE"
fi

# Enforce secure permissions on .env
chown "$APP_USER:$APP_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"
echo -e "  ${GREEN}[✓]${RESET} Production environment configuration locked (chmod 600)."

# ------------------------------------------------------------------------------
# STEP 5: Python Backend Virtual Environment & Package Installation
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[5/10] Building Python Backend Virtual Environment...${RESET}"
cd "$TARGET_DIR"

if [ ! -d "${TARGET_DIR}/.venv" ]; then
  echo -e "  [*] Creating Python virtual environment at ${TARGET_DIR}/.venv..."
  sudo -u "$APP_USER" python3 -m venv "${TARGET_DIR}/.venv"
fi

# Upgrade pip and install requirements
sudo -u "$APP_USER" "${TARGET_DIR}/.venv/bin/pip" install --upgrade pip setuptools wheel -q
echo -e "  [*] Installing backend dependencies from requirements.txt..."
sudo -u "$APP_USER" "${TARGET_DIR}/.venv/bin/pip" install -r "${TARGET_DIR}/requirements.txt" -q
echo -e "  ${GREEN}[✓]${RESET} Python backend environment initialized with all dependencies."

# ------------------------------------------------------------------------------
# STEP 6: Next.js Frontend Production Build
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[6/10] Compiling Next.js Production Frontend Bundle...${RESET}"
cd "${TARGET_DIR}/frontend"

sudo -u "$APP_USER" npm install --prefer-offline --no-audit --no-fund
sudo -u "$APP_USER" NEXT_TELEMETRY_DISABLED=1 npm run build
echo -e "  ${GREEN}[✓]${RESET} Next.js production bundle compiled successfully."
cd "$TARGET_DIR"

# ------------------------------------------------------------------------------
# STEP 7: Database Migration & Schema Verification
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[7/10] Verifying PostgreSQL Database & Executing Migrations...${RESET}"
cd "$TARGET_DIR"

export PYTHONPATH="$TARGET_DIR"
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# Run auto-bootstrap engine
echo -e "  [*] Checking database existence & auto-bootstrapping 'cbt'..."
BOOTSTRAP_OUTPUT=$(sudo -u "$APP_USER" -H env PYTHONPATH="$TARGET_DIR" "${TARGET_DIR}/.venv/bin/python" -c "
import sys
from backend.app.core.db_bootstrap import bootstrap_postgres_database
try:
    success = bootstrap_postgres_database(raise_on_failure=True)
    if success:
        print('BOOTSTRAP_SUCCESS')
    else:
        sys.exit(1)
except Exception as e:
    print(f'BOOTSTRAP_ERROR: {e}', file=sys.stderr)
    sys.exit(1)
" 2>&1 || true)

if echo "$BOOTSTRAP_OUTPUT" | grep -q "BOOTSTRAP_SUCCESS"; then
  echo -e "  ${GREEN}[✓]${RESET} PostgreSQL database verified and ready."
else
  echo -e "  ${YELLOW}[!] Warning during bootstrap:${RESET} ${BOOTSTRAP_OUTPUT}"
  echo -e "      (Continuing to migration check...)"
fi

echo -e "  [*] Applying Alembic schema migrations (upgrade head)..."
sudo -u "$APP_USER" -H env PYTHONPATH="$TARGET_DIR" "${TARGET_DIR}/.venv/bin/alembic" -c "${TARGET_DIR}/backend/alembic.ini" upgrade head
echo -e "  ${GREEN}[✓]${RESET} Database schema is up-to-date."

# ------------------------------------------------------------------------------
# STEP 8: Systemd Production Services Activation
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[8/10] Installing & Activating Systemd Production Services...${RESET}"

# Copy service unit files to /etc/systemd/system/
cp "${TARGET_DIR}/deployment/systemd/cbt-backend.service" /etc/systemd/system/
cp "${TARGET_DIR}/deployment/systemd/cbt-frontend.service" /etc/systemd/system/
cp "${TARGET_DIR}/deployment/systemd/cbt-backup.service" /etc/systemd/system/ 2>/dev/null || true
cp "${TARGET_DIR}/deployment/systemd/cbt-backup.timer" /etc/systemd/system/ 2>/dev/null || true

systemctl daemon-reload
systemctl enable cbt-backend cbt-frontend cbt-backup.timer 2>/dev/null || systemctl enable cbt-backend cbt-frontend
systemctl restart cbt-backend
systemctl restart cbt-frontend
echo -e "  ${GREEN}[✓]${RESET} Systemd background services (cbt-backend & cbt-frontend) active."

# ------------------------------------------------------------------------------
# STEP 9: NGINX Reverse Proxy, SSL / HTTPS, & Firewall Configuration
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[9/10] Configuring NGINX Reverse Proxy & SSL/HTTPS...${RESET}"

mkdir -p /var/www/certbot
chown -R www-data:www-data /var/www/certbot 2>/dev/null || true

# Check if an existing SSL certificate is available for the domain
CERT_FILE=""
KEY_FILE=""
if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ] && [ -f "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" ]; then
  CERT_FILE="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
  KEY_FILE="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"
  echo -e "  ${GREEN}[✓]${RESET} Found valid existing SSL certificate for: ${DOMAIN}"
fi

# If no cert yet, domain is not an IP, and certbot is available, attempt auto-issuance
if [ -z "$CERT_FILE" ] && [ "$DOMAIN" != "$PUBLIC_IP" ] && [ "$DOMAIN" != "localhost" ] && [ "$DOMAIN" != "127.0.0.1" ]; then
  echo -e "  [*] Attempting automated Let's Encrypt SSL certificate issuance for ${DOMAIN}..."
  
  # Temporary minimal NGINX config for ACME challenge
  cat > /etc/nginx/sites-available/cbt <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} ${PUBLIC_IP} localhost;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        try_files \$uri =404;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
    }
}
EOF
  ln -sf /etc/nginx/sites-available/cbt /etc/nginx/sites-enabled/cbt
  rm -f /etc/nginx/sites-enabled/default
  nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true

  if certbot certonly --webroot -w /var/www/certbot -d "${DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email 2>/dev/null; then
    CERT_FILE="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
    KEY_FILE="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"
    echo -e "  ${GREEN}[✓]${RESET} Let's Encrypt SSL certificate issued successfully for ${DOMAIN}!"
  else
    echo -e "  ${YELLOW}[!] Could not automatically obtain SSL certificate.${RESET}"
    echo -e "      (Ensure your domain's DNS A-Record points to ${PUBLIC_IP})"
    echo -e "      You can obtain it later with: ${BOLD}sudo certbot --nginx -d ${DOMAIN}${RESET}"
  fi
fi

# Build Complete Production NGINX configuration
NGINX_CONF="/etc/nginx/sites-available/cbt"

if [ -n "$CERT_FILE" ] && [ -n "$KEY_FILE" ]; then
  cat > "$NGINX_CONF" <<EOF
# CBT Examination Platform — NGINX Reverse Proxy (SSL / HTTPS Enabled)
upstream cbt_backend {
    server 127.0.0.1:8000 max_fails=3 fail_timeout=10s;
    keepalive 32;
}

upstream cbt_frontend {
    server 127.0.0.1:3000 max_fails=3 fail_timeout=10s;
    keepalive 32;
}

# HTTP Server (:80): ACME challenge & Redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} ${PUBLIC_IP} localhost;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        try_files \$uri =404;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

# HTTPS Server (:443): SSL Termination & Hardened Proxy
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN} ${PUBLIC_IP} localhost;

    ssl_certificate ${CERT_FILE};
    ssl_certificate_key ${KEY_FILE};

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    client_max_body_size 25M;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Health Checks
    location /health {
        proxy_pass http://cbt_backend/health;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }

    # API Routing
    location /api/ {
        proxy_pass http://cbt_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 60s;
    }

    # Next.js Web Application
    location / {
        proxy_pass http://cbt_frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
EOF
else
  cat > "$NGINX_CONF" <<EOF
# CBT Examination Platform — NGINX Reverse Proxy (HTTP Bootstrap)
upstream cbt_backend {
    server 127.0.0.1:8000 max_fails=3 fail_timeout=10s;
    keepalive 32;
}

upstream cbt_frontend {
    server 127.0.0.1:3000 max_fails=3 fail_timeout=10s;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} ${PUBLIC_IP} localhost;

    client_max_body_size 25M;

    # ACME Challenge for Let's Encrypt
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        try_files \$uri =404;
    }

    # Health Checks
    location /health {
        proxy_pass http://cbt_backend/health;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # API Routing
    location /api/ {
        proxy_pass http://cbt_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    # Next.js Web Application
    location / {
        proxy_pass http://cbt_frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
fi

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/cbt
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
echo -e "  ${GREEN}[✓]${RESET} NGINX reverse proxy configured and active."

# Configure UFW Firewall
if command -v ufw &>/dev/null; then
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 22/tcp comment 'SSH'
  ufw allow 80/tcp comment 'HTTP'
  ufw allow 443/tcp comment 'HTTPS'
  ufw --force enable 2>/dev/null || true
  echo -e "  ${GREEN}[✓]${RESET} UFW firewall configured (Ports 22, 80, 443 open; internal ports secured)."
fi

# ------------------------------------------------------------------------------
# STEP 10: Live End-to-End Health Verification
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[10/10] Performing Live End-to-End Verification...${RESET}"
sleep 2

BACKEND_UP=false
FRONTEND_UP=false
HTTPS_UP=false

for i in {1..20}; do
  if curl -sf http://127.0.0.1:8000/health &>/dev/null; then
    BACKEND_UP=true
    break
  fi
  sleep 1
done

for i in {1..20}; do
  if curl -sf http://127.0.0.1:3000 &>/dev/null; then
    FRONTEND_UP=true
    break
  fi
  sleep 1
done

if [ -n "$CERT_FILE" ]; then
  for i in {1..10}; do
    if curl -k -sf https://127.0.0.1/health &>/dev/null || curl -k -sf "https://${DOMAIN}/health" &>/dev/null; then
      HTTPS_UP=true
      break
    fi
    sleep 1
  done
fi

if [ "$BACKEND_UP" != true ]; then
  echo -e "  ${RED}[!] Warning: Backend health probe did not respond. Recent log:${RESET}"
  journalctl -u cbt-backend.service -n 12 --no-pager || true
fi

if [ "$FRONTEND_UP" != true ]; then
  echo -e "  ${RED}[!] Warning: Frontend probe did not respond. Recent log:${RESET}"
  journalctl -u cbt-frontend.service -n 12 --no-pager || true
fi

PORTAL_URL="http://${PUBLIC_IP}"
HEALTH_URL="http://${PUBLIC_IP}/health"
if [ "$HTTPS_UP" = true ]; then
  PORTAL_URL="https://${DOMAIN}"
  HEALTH_URL="https://${DOMAIN}/health"
elif [ "$DOMAIN" != "$PUBLIC_IP" ]; then
  PORTAL_URL="http://${DOMAIN} (or http://${PUBLIC_IP})"
  HEALTH_URL="http://${DOMAIN}/health"
fi

echo -e "\n${GREEN}${BOLD}==============================================================================${RESET}"
echo -e "${GREEN}${BOLD}       CBT EXAMINATION PLATFORM IS ACTIVATED & RUNNING IN PRODUCTION!        ${RESET}"
echo -e "${GREEN}${BOLD}==============================================================================${RESET}"
echo -e "  • ${BOLD}Public Web Portal:${RESET}      ${CYAN}${PORTAL_URL}${RESET}"
echo -e "  • ${BOLD}Public Health Probe:${RESET}    ${CYAN}${HEALTH_URL}${RESET}"
echo -e "  • ${BOLD}Backend Status:${RESET}         $([ "$BACKEND_UP" = true ] && echo -e "${GREEN}ACTIVE (Port 8000 - Background Daemon)${RESET}" || echo -e "${RED}CHECK LOGS${RESET}")"
echo -e "  • ${BOLD}Frontend Status:${RESET}        $([ "$FRONTEND_UP" = true ] && echo -e "${GREEN}ACTIVE (Port 3000 - Background Daemon)${RESET}" || echo -e "${RED}CHECK LOGS${RESET}")"
echo -e "  • ${BOLD}Reverse Proxy (Port 80):${RESET} ${GREEN}ACTIVE (NGINX Reverse Proxy)${RESET}"
echo -e "  • ${BOLD}HTTPS / SSL Status:${RESET}     $([ "$HTTPS_UP" = true ] && echo -e "${GREEN}ACTIVE (Port 443 - SSL Secured)${RESET}" || ([ -n "$CERT_FILE" ] && echo -e "${YELLOW}CONFIGURED (Verify external DNS)${RESET}" || echo -e "${YELLOW}HTTP Bootstrap (No SSL Certificate)${RESET}"))"
echo -e "  • ${BOLD}Runtime Mode:${RESET}           ${GREEN}PERMANENT SYSTEMD DAEMONS (24/7 Background)${RESET}"
echo -e "  • ${BOLD}Service User:${RESET}           ${APP_USER}"
echo -e "  • ${BOLD}Configuration:${RESET}          ${TARGET_DIR}/.env"
echo -e "=============================================================================="
echo -e "${BOLD}IMPORTANT DEPLOYMENT NOTES:${RESET}"
echo -e "  1. ${BOLD}Background Daemons:${RESET} The application runs 24/7 as systemd services."
echo -e "     It stays alive even after you close this terminal or log out."
echo -e "  2. ${BOLD}Azure Public Access:${RESET} To access http://${PUBLIC_IP} from your browser,"
echo -e "     ensure your ${BOLD}Azure Network Security Group (NSG)${RESET} allows Inbound Port 80 (HTTP) & 443 (HTTPS)."
echo -e "=============================================================================="

# Check if admin user is present
set +e
ADMIN_COUNT=$(sudo -u "$APP_USER" -H env PYTHONPATH="$TARGET_DIR" "${TARGET_DIR}/.venv/bin/python" -c "
from backend.app.core.database import SessionLocal
from backend.app.models.user import User
with SessionLocal() as db:
    cnt = db.query(User).filter(User.role.in_(['ADMIN', 'SUPER_ADMIN'])).count()
    print(cnt)
" 2>/dev/null || echo "0")
set -e

if [ "$ADMIN_COUNT" -eq 0 ]; then
  echo -e "\n${YELLOW}${BOLD}[!] NOTICE: No System Administrator account exists in the database.${RESET}"
  echo -e "    Run the following command to provision your administrator account:"
  echo -e "    ${BOLD}sudo -u cbt ./scripts/create-admin.sh${RESET}\n"
else
  echo -e "\n  ${GREEN}[✓]${RESET} System Administrator account is active (${ADMIN_COUNT} registered)."
fi

echo -e "${CYAN}${BOLD}Useful Operational Commands:${RESET}"
echo -e "  • View Service Status:       ${BOLD}sudo systemctl status cbt-backend cbt-frontend nginx${RESET}"
echo -e "  • View Backend Logs:         ${BOLD}journalctl -u cbt-backend.service -f${RESET}"
echo -e "  • View Frontend Logs:        ${BOLD}journalctl -u cbt-frontend.service -f${RESET}"
echo -e "  • Restart All Services:      ${BOLD}./scripts/production.sh restart${RESET}"
if [ "$DOMAIN" != "$PUBLIC_IP" ] && [ -z "$CERT_FILE" ]; then
  echo -e "  • Enable Free SSL (HTTPS):   ${BOLD}sudo certbot --nginx -d ${DOMAIN}${RESET}"
fi
echo -e "==============================================================================\n"
