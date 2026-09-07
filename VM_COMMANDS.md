# VM Quick Commands Cheatsheet

Point-to-point commands for managing the CBT Examination Platform on your Virtual Machine.

---

### 1. Clone & Enter Project Directory
```bash
sudo git clone <REPOSITORY_URL> /opt/cbt
cd /opt/cbt
```

---

### 2. Start Production (Auto-Bootstrap DB & Start All Services)
```bash
cd /opt/cbt
./scripts/production.sh start
```
*(Automatically ensures `cbt` DB exists on PostgreSQL, runs migrations, starts backend, frontend, NGINX, and verifies health).*

---

### 3. Update Code & Restart Production
```bash
cd /opt/cbt
git pull
./scripts/production.sh deploy
```
*(Creates safety DB backup, pulls updates, runs migrations, compiles frontend build, and restarts all services).*

---

### 4. Safe Shutdown (Stop Services Gracefully)
```bash
cd /opt/cbt
./scripts/shutdown.sh
```
*(Gracefully terminates backend and frontend workers via SIGTERM, closes DB connections safely, and preserves PostgreSQL).*

---

### 5. Check System Status & Health
```bash
cd /opt/cbt
./scripts/production.sh status
.venv/bin/python scripts/check_status.py
```
*(Displays active systemd services, listening ports, DB latency, table row counts, and API health).*

---

### 6. Live Logs Monitoring
```bash
cd /opt/cbt
./scripts/production.sh logs
```
*(Or for systemd: `sudo journalctl -u cbt-backend -u cbt-frontend -n 50 -f`)*

---

### 7. Create Administrator Account
```bash
cd /opt/cbt
./scripts/create-admin.sh
```
*(Interactively creates a new system administrator with bcrypt password hashing in the PostgreSQL `cbt` database).*

---

### 8. Automated Database Backup
```bash
cd /opt/cbt
./scripts/production.sh backup
```
*(Creates a compressed timestamped PostgreSQL dump in `/opt/cbt/backups/`).*
