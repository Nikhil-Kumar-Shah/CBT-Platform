# CBT Examination Platform — VM Production Commands Cheatsheet

Point-to-point operations guide for managing the CBT Examination Platform on your Linux Virtual Machine (`/opt/cbt`) as the non-root operator user **`Nikhil-VM`**.

---

### 0. Fresh VM Clean Setup (From Scratch)

If you deleted the previous code on the Virtual Machine, execute these commands in order:

#### Step A: Install System Packages
```bash
sudo apt update && sudo apt install -y python3 python3-venv python3-pip nodejs npm nginx postgresql-client curl git psmisc
```

#### Step B: Clone Repository into `/opt/cbt` as `Nikhil-VM`
```bash
# Create directory and assign ownership to Nikhil-VM
sudo mkdir -p /opt/cbt
sudo chown -R Nikhil-VM:Nikhil-VM /opt/cbt

# Clone the repository
git clone https://github.com/Nikhil-Kumar-Shah/CBT-Platform.git /opt/cbt
cd /opt/cbt
```

#### Step C: Configure Production Secrets (`.env`)
```bash
cp .env.example .env
nano .env   # Fill in POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, SECRET_KEY
chmod 600 .env
```

#### Step D: One-Time System Configuration (Run with `sudo`)
```bash
sudo ./scripts/setup-production-user.sh Nikhil-VM
```
*(Installs systemd services, `/etc/sudoers.d/cbt`, logs & backups directories, and sets ownership)*

#### Step E: Python Virtual Environment & Dependencies
```bash
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
```

#### Step F: Build Next.js Production Bundle
```bash
cd /opt/cbt/frontend
npm install
npm run build
cd /opt/cbt
```

#### Step G: Configure NGINX Reverse Proxy
```bash
sudo cp deployment/nginx/cbt.conf /etc/nginx/sites-available/cbt
sudo ln -sf /etc/nginx/sites-available/cbt /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

#### Step H: Launch Application & Verify (as `Nikhil-VM` without root!)
```bash
./production.sh restart
./production.sh status
```

---


### 1. Interactive Production Controller (Recommended)
Simply navigate to `/opt/cbt` and execute `./production.sh` with no arguments:

```bash
cd /opt/cbt
./production.sh
```

This launches the **Interactive Management Console** with live system diagnostics and a colorful menu:
```text
  [1] 🚀 Full Update & Deploy (git pull + pip + db migrate + npm build + restart + verify)
  [2] 🔄 Clean Restart & Renew (clear rogue ports, restart services, verify health)
  [3] 📊 Health Check & Status (deep port & database verification)
  [4] 📦 Database Backup (create timestamped PostgreSQL backup in /opt/cbt/backups)
  [5] 📋 Live Stream Logs (journalctl -u cbt-backend -u cbt-frontend)
  [6] ⏹️ Stop All Services (graceful shutdown of backend & frontend)
  [7] 🚪 Exit
```

---

### 2. 1-Click Atomic Update & Deploy
Whenever new code is pushed to your Git repository:

```bash
cd /opt/cbt
./production.sh update
```
*(Alias: `./production.sh deploy`)*

**What this automatically executes in 6 verified stages:**
1. **Git Sync**: Pulls latest commits from remote on your current branch.
2. **Safety Backup**: Creates an automatic timestamped PostgreSQL backup.
3. **Dependency Sync**: Verifies and installs Python packages (`requirements.txt`) into `.venv`.
4. **Database Migrations**: Auto-bootstraps the database and applies `alembic upgrade head`.
5. **Frontend Rebuild**: Compiles the Next.js production build (`npm run build`).
6. **Clean Renewal**: Terminates any rogue orphan processes on ports 8000 and 3000, restarts systemd units (`cbt-backend`, `cbt-frontend`), reloads NGINX, and runs live health verification.

---

### 3. Clean Restart & Renew (Resolves Port & Inactive Unit Conflicts)
If services ever need refreshing, or if `cbt-backend` was shown as `[INACTIVE]` while port 8000 was listening:

```bash
cd /opt/cbt
./production.sh restart
```

**What this does:**
- Identifies and frees any orphan/rogue processes holding port 8000 or 3000.
- Re-verifies and applies database schema migrations.
- Sets proper file ownership (`cbt:cbt`) on logs and `.next`.
- Restarts systemd units `cbt-backend` and `cbt-frontend`, and reloads NGINX.
- Executes multi-point health checks (`/health`, `/health/ready`, port 3000, port 80/443).

---

### 4. Live System Status & Diagnostics
Check service units, listening ports, and API endpoints:

```bash
cd /opt/cbt
./production.sh status
```

Or for deep database metrics, table row counts, and latency:
```bash
.venv/bin/python scripts/check_status.py
```

---

### 5. Live Logs Monitoring
Stream unified real-time logs from both backend and frontend:

```bash
cd /opt/cbt
./production.sh logs
```
*(Or inspect via systemd directly: `sudo journalctl -u cbt-backend -u cbt-frontend -n 60 -f`)*

---

### 6. Create Administrator Account
Create a new administrator with bcrypt password hashing in the PostgreSQL database:

```bash
cd /opt/cbt
./scripts/create-admin.sh
```

---

### 7. Automated Database Backup & Verification
Create a timestamped compressed backup:

```bash
cd /opt/cbt
./production.sh backup
```

Verify that backups can be restored into an isolated sandbox:
```bash
cd /opt/cbt
./production.sh restore-test
```

---

### 8. Graceful Stop
Stop all application services safely while preserving the database:

```bash
cd /opt/cbt
./production.sh stop
```
