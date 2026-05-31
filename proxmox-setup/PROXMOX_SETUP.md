# STAP — Proxmox PostgreSQL Container Setup Guide

## Container Plan

| Field          | Value                       |
|----------------|-----------------------------|
| Container ID   | 125                         |
| Name           | stap-db                     |
| OS             | Ubuntu 22.04 LTS            |
| CPU            | 2 cores                     |
| RAM            | 2048 MB                     |
| Disk           | 20 GB                       |
| IP Address     | 192.168.1.125/24  ← UPDATE  |
| Gateway        | 192.168.1.1       ← UPDATE  |
| Root Password  | Stap@2026!Root              |
| DB Name        | stap_db                     |
| DB User        | stap_user                   |
| DB Password    | Stap@2026!Secure            |
| DB Port        | 5432                        |

---

## PART 1 — Create the Container in Proxmox Web UI

### Step 1: Download Ubuntu Template

In Proxmox: **pve2 → Shell** → paste:
```bash
pveam update
pveam download local ubuntu-22.04-standard_22.04-1_amd64.tar.zst
```
Wait for download to finish (~500MB).

---

### Step 2: Create Container via Web UI

Click **Create CT** button (top right of Proxmox UI)

**Tab 1 — General:**
```
Node          : pve2
CT ID         : 125
Hostname      : stap-db
Unprivileged  : ✓ (checked)
Password      : Stap@2026!Root
Confirm       : Stap@2026!Root
```

**Tab 2 — Template:**
```
Storage  : local
Template : ubuntu-22.04-standard_22.04-1_amd64.tar.zst
```

**Tab 3 — Disks:**
```
Storage  : local-lvm
Disk size: 20 GB
```

**Tab 4 — CPU:**
```
Cores: 2
```

**Tab 5 — Memory:**
```
Memory : 2048 MB
Swap   : 512 MB
```

**Tab 6 — Network:**
```
Name     : eth0
Bridge   : vmbr0
IPv4     : Static
IP/CIDR  : 192.168.1.125/24   ← YOUR IP HERE
Gateway  : 192.168.1.1        ← YOUR GATEWAY HERE
IPv6     : None
```

**Tab 7 — DNS:**
```
DNS server: 8.8.8.8
```

**Finish tab:**
```
✓ Check "Start after created"
Click FINISH
```

---

### Step 3: Create via Shell (alternative — paste in pve2 Shell)

```bash
pct create 125 local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst \
  --hostname stap-db \
  --password "Stap@2026!Root" \
  --cores 2 \
  --memory 2048 \
  --swap 512 \
  --storage local-lvm \
  --rootfs local-lvm:20 \
  --net0 name=eth0,bridge=vmbr0,ip=192.168.1.125/24,gw=192.168.1.1 \
  --nameserver 8.8.8.8 \
  --unprivileged 1 \
  --onboot 1 \
  --start 1
```

---

## PART 2 — Install PostgreSQL Inside the Container

### Open Container Console

In Proxmox: Click **125 (stap-db)** → **Console** tab

OR from pve2 Shell:
```bash
pct enter 125
```

### Paste ALL commands below (copy the entire block):

```bash
# ── 1. System update ──────────────────────────────────────────
apt-get update -y && apt-get upgrade -y
apt-get install -y curl wget gnupg2 lsb-release ufw net-tools vim

# ── 2. Add PostgreSQL 15 official repo ────────────────────────
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg

echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list

apt-get update -y
apt-get install -y postgresql-15 postgresql-contrib-15

# ── 3. Start PostgreSQL ───────────────────────────────────────
systemctl enable postgresql
systemctl start postgresql

# ── 4. Create STAP database and user ─────────────────────────
sudo -u postgres psql << 'SQLEOF'
CREATE USER stap_user WITH LOGIN PASSWORD 'Stap@2026!Secure' CREATEDB;
CREATE DATABASE stap_db OWNER stap_user ENCODING 'UTF8' TEMPLATE template0;
GRANT ALL PRIVILEGES ON DATABASE stap_db TO stap_user;
\c stap_db
GRANT ALL ON SCHEMA public TO stap_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO stap_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO stap_user;
CREATE USER stap_readonly WITH LOGIN PASSWORD 'StapRead@2026';
GRANT CONNECT ON DATABASE stap_db TO stap_readonly;
GRANT USAGE ON SCHEMA public TO stap_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO stap_readonly;
\echo 'Done.'
SQLEOF

# ── 5. Allow remote connections ───────────────────────────────
sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" \
  /etc/postgresql/15/main/postgresql.conf

cat >> /etc/postgresql/15/main/pg_hba.conf << 'HBAEOF'

# STAP project remote access
host  stap_db  stap_user      192.168.1.0/24   scram-sha-256
host  stap_db  stap_readonly  192.168.1.0/24   scram-sha-256
host  stap_db  stap_user      10.0.0.0/8       scram-sha-256
host  stap_db  stap_user      172.16.0.0/12    scram-sha-256
HBAEOF

systemctl restart postgresql

# ── 6. Firewall ───────────────────────────────────────────────
ufw allow ssh
ufw allow 5432/tcp comment "PostgreSQL STAP"
ufw --force enable

# ── 7. Confirm everything works ───────────────────────────────
echo ""
echo "========================================"
echo "PostgreSQL running:"
systemctl is-active postgresql
echo ""
echo "Databases:"
sudo -u postgres psql -c "\l" | grep -E "stap|Name"
echo ""
echo "Users:"
sudo -u postgres psql -c "\du" | grep -E "stap|Role"
echo "========================================"
echo ""
echo "STAP DB READY"
echo "IP:       $(hostname -I | awk '{print $1}')"
echo "DB:       stap_db"
echo "User:     stap_user"
echo "Pass:     Stap@2026!Secure"
echo "Port:     5432"
```

---

## PART 3 — Test the Connection

### From your Windows PC (PowerShell or CMD):
```powershell
# Test if port is reachable
Test-NetConnection -ComputerName 192.168.1.125 -Port 5432
```
Should show: `TcpTestSucceeded : True`

### Using Python (from your project folder):
```python
# run: python test_db.py
import asyncio, asyncpg

async def test():
    try:
        conn = await asyncpg.connect(
            "postgresql://stap_user:Stap@2026!Secure@192.168.1.125:5432/stap_db"
        )
        ver = await conn.fetchval("SELECT version()")
        print(f"✓ Connected! PostgreSQL: {ver[:40]}")
        await conn.close()
    except Exception as e:
        print(f"✗ Failed: {e}")

asyncio.run(test())
```

---

## PART 4 — Update STAP Project

The `.env` file at `backend-python/.env` already has:
```
DATABASE_URL=postgresql+asyncpg://stap_user:Stap@2026!Secure@192.168.1.125:5432/stap_db
```

**If your IP is different**, open that file and change `192.168.1.125` to your real container IP.

Then start the STAP backend — it creates all tables automatically:
```bash
cd backend-python
venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

---

## All Credentials Summary

| What              | Value                         |
|-------------------|-------------------------------|
| Proxmox node      | pve2                          |
| Container ID      | 125                           |
| Container name    | stap-db                       |
| Container IP      | 192.168.1.125                 |
| Container root pw | Stap@2026!Root                |
| DB host           | 192.168.1.125                 |
| DB port           | 5432                          |
| DB name           | stap_db                       |
| DB user           | stap_user                     |
| DB password       | Stap@2026!Secure              |
| Read-only user    | stap_readonly                 |
| Read-only pass    | StapRead@2026                 |

**Full connection URL:**
```
postgresql+asyncpg://stap_user:Stap@2026!Secure@192.168.1.125:5432/stap_db
```

---

## Container Management (pve2 Shell)

```bash
pct status 125          # check running status
pct start 125           # start
pct stop 125            # stop
pct reboot 125          # restart
pct enter 125           # open shell inside container
pct snapshot 125 snap1  # create snapshot backup
pct config 125          # view full config
```

---

## PostgreSQL Useful Commands (inside container)

```bash
# Enter PostgreSQL prompt
sudo -u postgres psql

# Inside psql:
\l                              -- list databases
\du                             -- list users
\c stap_db                      -- switch to STAP database
\dt                             -- list all tables (after first STAP run)
SELECT count(*) FROM alert_rules;
SELECT count(*) FROM alert_events;

# Backup
sudo -u postgres pg_dump stap_db > /root/stap_backup_$(date +%Y%m%d).sql

# View PostgreSQL logs
tail -50 /var/log/postgresql/postgresql-15-main.log
```
