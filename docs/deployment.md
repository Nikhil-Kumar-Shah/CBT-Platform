# CBT Examination Platform — Production Deployment & Security Runbook

This document provides complete instructions for deploying, hardening, monitoring, and backing up the CBT Platform in production.

---

## 1. System Architecture

```
Internet (Port 80/443)
       │
       ▼
Nginx (Reverse Proxy & TLS Termination, Security Headers, Rate Limiting)
       │
       ├─────────────────────────┐
       ▼                         ▼
Next.js Frontend (Port 3000)  FastAPI Backend (Port 8000 via .venv Uvicorn)
                                 │
                                 ▼
                      PostgreSQL 16/18 Database
```

- **Reverse Proxy**: Nginx terminates HTTPS, applies HSTS, redirects HTTP → HTTPS, enforces request limits (10MB max body), and proxies requests to local internal ports.
- **Frontend**: Next.js App Router running in production mode (`npm run start`), serving SSR pages and client bundles.
- **Backend**: FastAPI running within `.venv` via multi-worker Uvicorn (`cbt-backend.service`).
- **Database**: PostgreSQL with access restricted strictly to `127.0.0.1` / private Docker bridge network.

---

## 2. Environment Configuration

### Required Environment Variables
Create `/var/www/cbt/.env` (or copy from `.env.example`). Never commit production secrets.

```bash
# Application Environment
APP_ENV=production
APP_NAME="CBT Platform API"
APP_DEBUG=false

# Database Configuration (Dedicated least-privilege user)
DATABASE_URL=postgresql+psycopg://cbt_app_user:STRONG_SECURE_PASSWORD@127.0.0.1:5432/cbt_prod_db

# Security & Sessions
SECRET_KEY=GENERATE_USING_PYTHON_SECRETS_48_BYTES
SESSION_COOKIE_NAME=cbt_admin_session
SESSION_DURATION=86400
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=lax

# Rate Limiting (Abuse Prevention)
RATE_LIMIT_LOGIN_PER_MINUTE=5
RATE_LIMIT_CODE_VERIFY_PER_MINUTE=30
RATE_LIMIT_ATTEMPT_START_PER_MINUTE=15

# CORS Configuration (Restricted to production domain)
CORS_ORIGINS=https://cbt.example.com

# Media & Storage
STORAGE_BACKEND=local
LOCAL_STORAGE_DIR=backend/media

# Automated Database Backup Configuration
BACKUP_DIR=/var/backups/cbt
BACKUP_RETENTION_DAYS=7
```

Generate secure secrets using Python:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

---

## 3. Database Hardening & Migrations

### Create Dedicated Production User (Least Privilege)
Run in `psql` as postgres superuser:
```sql
CREATE DATABASE cbt_prod_db;
CREATE USER cbt_app_user WITH ENCRYPTED PASSWORD 'STRONG_SECURE_PASSWORD';
GRANT CONNECT ON DATABASE cbt_prod_db TO cbt_app_user;
GRANT ALL PRIVILEGES ON DATABASE cbt_prod_db TO cbt_app_user;
\c cbt_prod_db
GRANT ALL ON SCHEMA public TO cbt_app_user;
```

### Apply Migrations
Always run migrations via Alembic in `.venv`:
```bash
source .venv/bin/activate
alembic upgrade head
```

Verify migration status:
```bash
alembic current
```

---

## 4. Reverse Proxy & HTTPS (Nginx)

1. Copy Nginx configuration:
   ```bash
   sudo cp deployment/nginx/cbt.conf /etc/nginx/sites-available/cbt.conf
   sudo ln -s /etc/nginx/sites-available/cbt.conf /etc/nginx/sites-enabled/
   ```

2. Obtain free Let's Encrypt TLS certificate:
   ```bash
   sudo certbot --nginx -d cbt.example.com
   ```

3. Test configuration and restart:
   ```bash
   sudo nginx -t
   sudo systemctl restart nginx
   ```

---

## 5. Process Management (systemd)

1. Copy systemd service files:
   ```bash
   sudo cp deployment/systemd/cbt-backend.service /etc/systemd/system/
   sudo cp deployment/systemd/cbt-frontend.service /etc/systemd/system/
   ```

2. Reload systemd and enable automatic startup on boot:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now cbt-backend.service
   sudo systemctl enable --now cbt-frontend.service
   ```

3. Check service status:
   ```bash
   sudo systemctl status cbt-backend
   sudo systemctl status cbt-frontend
   ```

4. View production logs:
   ```bash
   sudo journalctl -u cbt-backend -f
   sudo journalctl -u cbt-frontend -f
   ```

---

## 6. Automated PostgreSQL Backups & Retention

### Automated Daily Backup Script
The platform provides `scripts/backup_db.py`, which:
- Dumps the database using `pg_dump` in custom compressed format (`-F c`).
- Verifies dump file integrity and non-zero size.
- Deletes dumps older than `BACKUP_RETENTION_DAYS` (default 7 days).

### Configure Cron for Daily Automated Backups
Edit crontab (`crontab -e`):
```cron
# Run daily database backup at 02:00 AM UTC
0 2 * * * /var/www/cbt/.venv/bin/python /var/www/cbt/scripts/backup_db.py >> /var/log/cbt-backup.log 2>&1
```

### Offsite Replication Recommendation
To survive hardware/VM destruction, mount `/var/backups/cbt` to an attached secondary block storage volume, or sync daily dumps to object storage (e.g. AWS S3 / Azure Blob) via cron:
```bash
aws s3 sync /var/backups/cbt s3://your-backup-bucket/cbt-backups/ --delete
```

---

## 7. Disaster Recovery Procedure (Runbook)

In the event of total server loss:

1. **Provision Replacement VM**:
   - Ubuntu 22.04 LTS / 24.04 LTS or Debian 12 with PostgreSQL 16+, Node.js 18+, Python 3.12+, Nginx.

2. **Clone Codebase & Set Up Environment**:
   ```bash
   git clone <repo_url> /var/www/cbt
   cd /var/www/cbt
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r backend/requirements.txt
   cd frontend && npm ci && npm run build && cd ..
   ```

3. **Configure Environment**:
   - Restore `/var/www/cbt/.env` with production keys and secrets.

4. **Restore Database from Backup Dump**:
   ```bash
   # Retrieve latest backup dump from offsite storage
   # Restore into fresh PostgreSQL database:
   createdb -h 127.0.0.1 -U cbt_app_user cbt_prod_db
   pg_restore -h 127.0.0.1 -U cbt_app_user -d cbt_prod_db -v --no-owner /path/to/cbt_backup_YYYYMMDD_HHMMSS.dump
   ```

5. **Verify Database Integrity**:
   ```bash
   python scripts/restore_test.py
   ```

6. **Start Services & Verify**:
   ```bash
   sudo systemctl restart cbt-backend
   sudo systemctl restart cbt-frontend
   sudo systemctl restart nginx
   curl -I https://cbt.example.com/health
   curl -I https://cbt.example.com/health/ready
   ```

7. **Perform Smoke Test Verification**:
   - Check `/login`: Verify admin login.
   - Check `/exam`: Verify access code entry.
   - Check `/admin/results`: Verify past attempt analytics and CSV exports.

---

## 8. Security Hardening Audit Checklist

- [x] **Database Isolation**: PostgreSQL not exposed on public IP; accessible only via localhost.
- [x] **Secrets Externalized**: No plain-text passwords or secret keys in repository; `.env` strictly gitignored.
- [x] **Cookie Security**: Session cookies enforce `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- [x] **CORS Restricted**: Authenticated routes restricted to production domain origin (no wildcard `*`).
- [x] **Reverse Proxy Hardening**: Nginx handles 80 → 443 HTTPS redirect, TLS 1.2/1.3, intermediate ciphers, and client IP forwarding.
- [x] **Security Headers**: HSTS, X-Frame-Options: SAMEORIGIN, X-Content-Type-Options: nosniff, Referrer-Policy, Permissions-Policy, KaTeX/image-compatible CSP.
- [x] **Abuse & Rate Limiting**: In-memory sliding-window limiter on admin login (5 req/min), code verify (30 req/min), attempt start (15 req/min).
- [x] **CSV Formula Injection Prevention**: Candidate and question export cells sanitized (`='`, `+'`, `-'`, `@'`).
- [x] **Media Upload Validation**: MIME check, Pillow image header verification, 5MB limit, 4096px dimension ceiling, UUID storage keys.
- [x] **Information Leakage Prevention**: Production exception handler masks stack traces and database errors (safe HTTP 500 response).
- [x] **Health Checks**: Lightweight process `/health` liveness + PostgreSQL `/health/ready` connectivity probe.
- [x] **Backup Verification**: `scripts/backup_db.py` automated dump + `scripts/restore_test.py` verified against PostgreSQL.
