# CBT Platform — Production Deployment & Operational Runbook

This guide covers the deployment, supervision, backup, recovery, and operational maintenance of the CBT examination platform on a Linux VM.

---

## 1. Production Architecture Overview

```text
Internet (Port 80 / 443)
       │
       ▼
 ┌───────────┐
 │   NGINX   │ Reverse Proxy (TLS termination, HTTP->HTTPS redirect, static media, rate-limits)
 └─────┬─────┘
       │
       ├────────────────────────────────────────┐
       │ (localhost:3000)                       │ (localhost:8000)
       ▼                                        ▼
┌──────────────┐                       ┌─────────────────┐
│ Next.js      │ Frontend SSR & UI     │ FastAPI Backend │ Business Logic, Auth & Scoring
│ (Node.js 20) │                       │ (Python 3.12)   │
└──────────────┘                       └────────┬────────┘
                                                │ (localhost:5432 - SCRAM-SHA-256)
                                                ▼
                                       ┌─────────────────┐
                                       │ PostgreSQL 16+  │ Strictly localhost only
                                       └─────────────────┘
```

### Security & Network Invariants:
1. **Firewall (UFW)**: Only ports `22` (SSH), `80` (HTTP), and `443` (HTTPS) are exposed.
2. **Local Isolation**: PostgreSQL (`5432`), FastAPI (`8000`), and Next.js (`3000`) listen exclusively on `127.0.0.1`.
3. **Database Sandboxing**: PostgreSQL rejects all connections from external IP addresses.

---

## 2. Directory Layout on Linux VM

```text
/var/www/cbt/
├── .env                       # Production secrets (chmod 600 cbt:cbt)
├── .venv/                     # Python virtual environment
├── production.sh              # Single controlled production entry point (chmod +x)
├── backend/                   # FastAPI source & Alembic migrations
│   └── media/                 # Question images / diagrams (persistent volume)
├── frontend/                  # Next.js application & standalone build
├── scripts/                   # Backup, restore test, and monitoring scripts
│   ├── backup_db.py
│   ├── restore_test.py
│   └── system_monitor.py
├── backups/                   # Automated PostgreSQL dumps (persistent volume)
└── logs/                      # Fallback logs directory (or /var/log/cbt)
```

---

## 3. Single Controlled Entry Point: `production.sh`

All production operations must be executed via `production.sh` (or `active production.sh`):

```bash
# Check status of all units, listening ports, and health probes
./production.sh status

# Execute atomic deployment (pre-check -> backup -> migrate -> build -> restart -> health)
./production.sh deploy

# Trigger manual automated backup
./production.sh backup

# Run backup restore test against an isolated temporary database
./production.sh restore-test

# Check liveness and readiness health probes
./production.sh health

# Inspect CPU, RAM, disk usage, backup recency, and PostgreSQL connection counts
./production.sh monitor

# Verify that all units are enabled to survive a VM reboot
./production.sh reboot-check

# Start, stop, or restart services
./production.sh restart
```

---

## 4. Initial VM Provisioning Procedure

### Step 1: Install System Packages
```bash
sudo apt update && sudo apt install -y \
    nginx postgresql postgresql-contrib \
    python3 python3-venv python3-pip \
    nodejs npm curl ufw logrotate
```

### Step 2: Configure Firewall
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### Step 3: Create Dedicated System User
```bash
sudo useradd -m -s /bin/bash cbt
sudo mkdir -p /var/www/cbt /var/log/cbt
sudo chown -R cbt:cbt /var/www/cbt /var/log/cbt
```

### Step 4: Configure PostgreSQL
```bash
sudo -u postgres psql -c "CREATE USER cbt_app_user WITH PASSWORD 'SECURE_PRODUCTION_DB_PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE cbt_prod_db OWNER cbt_app_user;"

# Copy recommended configs
sudo cp deployment/postgres/postgresql.conf.recommended /etc/postgresql/16/main/conf.d/cbt.conf
sudo cp deployment/postgres/pg_hba.conf.recommended /etc/postgresql/16/main/pg_hba.conf
sudo systemctl restart postgresql
```

### Step 5: Install Systemd Units & Timers
```bash
sudo cp deployment/systemd/cbt-backend.service /etc/systemd/system/
sudo cp deployment/systemd/cbt-frontend.service /etc/systemd/system/
sudo cp deployment/systemd/cbt-backup.service /etc/systemd/system/
sudo cp deployment/systemd/cbt-backup.timer /etc/systemd/system/
sudo cp deployment/logrotate/cbt /etc/logrotate.d/cbt

sudo systemctl daemon-reload
sudo systemctl enable postgresql cbt-backend cbt-frontend nginx cbt-backup.timer
sudo systemctl start cbt-backup.timer
```

### Step 6: Configure HTTPS via Let's Encrypt
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot certonly --nginx -d cbt.yourdomain.com

sudo cp deployment/nginx/cbt.conf /etc/nginx/sites-available/cbt.conf
sudo ln -sf /etc/nginx/sites-available/cbt.conf /etc/nginx/sites-enabled/cbt.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
```

---

## 5. Routine Deployment Procedure

To deploy application updates without downtime:

```bash
cd /var/www/cbt

# 1. Pull latest code or extract release bundle
git pull origin main

# 2. Trigger the atomic deployment pipeline
./production.sh deploy
```

### What `./production.sh deploy` executes automatically:
1. **Pre-deployment Verification**: Validates `.env` and environment variables.
2. **Automated Database Backup**: Creates a timestamped `.dump` before any changes are made. If backup fails, deployment aborts immediately.
3. **Dependency Sync**: Installs any new Python and Node packages.
4. **Database Migrations**: Runs `alembic -c backend/alembic.ini upgrade head`.
5. **Frontend Build**: Compiles the Next.js production build (`npm run build`).
6. **Service Reload**: Gracefully restarts `cbt-backend` and `cbt-frontend`.
7. **Readiness Probe**: Queries `/health/ready` to ensure database connectivity is confirmed.

---

## 6. Rollback Procedure

If a deployed version causes unexpected issues:

### Case A: Application Code Issue (No Schema Change)
```bash
cd /var/www/cbt
# Checkout previous known-good git commit or release tag
git checkout <previous-commit-or-tag>

# Recompile frontend and restart
(cd frontend && npm run build)
./production.sh restart
```

### Case B: Migration Issue Requiring Database Restore
1. Stop application traffic:
   ```bash
   ./production.sh stop
   ```
2. Locate the pre-deployment backup dump in `/var/www/cbt/backups/`:
   ```bash
   ls -lt /var/www/cbt/backups/
   ```
3. Restore database cleanly using `pg_restore`:
   ```bash
   # Drop connections and restore into cbt_prod_db
   sudo -u postgres pg_restore -h 127.0.0.1 -U cbt_app_user -d cbt_prod_db --clean --if-exists /var/www/cbt/backups/cbt_backup_cbt_prod_db_YYYYMMDD_HHMMSS.dump
   ```
4. Revert code to matching version, recompile frontend, and restart:
   ```bash
   git checkout <matching-commit>
   (cd frontend && npm run build)
   ./production.sh start
   ```

---

## 7. Automated Backups & Restore Testing

### Backup Schedule:
- Handled by `cbt-backup.timer` every day at `02:00 UTC`.
- Backups are stored in `/var/www/cbt/backups/` as custom compressed dumps (`.dump`).
- Expired backups older than `BACKUP_RETENTION_DAYS` (default 7 days) are automatically pruned.

### Automated Restore Verification Test:
Run at any time without impacting production traffic:
```bash
./production.sh restore-test
```
This script:
1. Generates a fresh backup dump.
2. Creates an isolated temporary database (`cbt_restore_verify_test`).
3. Restores the dump into the temporary database.
4. Verifies presence and record counts for all 10 core tables (`users`, `user_sessions`, `subjects`, `test_series`, `tests`, `questions`, `question_options`, `test_attempts`, `test_attempt_answers`, `attempt_integrity_events`).
5. Verifies administrator accounts exist.
6. Drops the temporary database cleanly.

---

## 8. Crash Recovery & VM Reboot Invariants

The platform is designed to recover automatically from unexpected host reboots or process crashes:

1. **Process Crash**: Systemd automatically restarts `cbt-backend` and `cbt-frontend` within 5 seconds (`Restart=always`, `RestartSec=5s`).
2. **VM Reboot**:
   - `postgresql.service` starts automatically.
   - `cbt-backend.service` waits for PostgreSQL, then starts.
   - `cbt-frontend.service` waits for backend, then starts.
   - `nginx.service` starts and begins serving HTTPS traffic.
   - All student sessions, attempt answers, timers, and uploaded media are preserved without data loss.

To verify reboot readiness at any time:
```bash
./production.sh reboot-check
```
