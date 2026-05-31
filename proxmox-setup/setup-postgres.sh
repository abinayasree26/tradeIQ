#!/bin/bash
# ============================================================
# STAP PostgreSQL Setup — run INSIDE the LXC container 125
#
# How to run:
#   pct exec 125 -- bash -c "$(curl -fsSL <url>)"
#   OR copy-paste the commands below into the container shell:
#   pct enter 125
# ============================================================

set -e   # exit on any error

echo "======================================"
echo " STAP — PostgreSQL Setup"
echo " Container: stap-db (ID 125)"
echo "======================================"

# ── 1. System update ──────────────────────────────────────────────────────────
apt-get update -y && apt-get upgrade -y
apt-get install -y curl wget gnupg2 lsb-release ufw

# ── 2. Install PostgreSQL 15 ──────────────────────────────────────────────────
echo "Installing PostgreSQL 15..."
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list
apt-get update -y
apt-get install -y postgresql-15 postgresql-contrib-15

# ── 3. Start and enable PostgreSQL ────────────────────────────────────────────
systemctl enable postgresql
systemctl start postgresql

# ── 4. Create STAP database + user ───────────────────────────────────────────
echo "Creating STAP database and user..."
sudo -u postgres psql <<EOF

-- Create dedicated user for STAP
CREATE USER stap_user WITH
  LOGIN
  PASSWORD 'Stap@2026!Secure'
  CREATEDB;

-- Create the database
CREATE DATABASE stap_db
  OWNER stap_user
  ENCODING 'UTF8'
  LC_COLLATE 'en_US.UTF-8'
  LC_CTYPE 'en_US.UTF-8'
  TEMPLATE template0;

-- Grant all privileges
GRANT ALL PRIVILEGES ON DATABASE stap_db TO stap_user;

-- Connect to stap_db and set schema permissions
\c stap_db
GRANT ALL ON SCHEMA public TO stap_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO stap_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO stap_user;

\echo '✓ Database stap_db and user stap_user created.'
EOF

# ── 5. Allow remote connections ────────────────────────────────────────────────
PG_CONF="/etc/postgresql/15/main/postgresql.conf"
PG_HBA="/etc/postgresql/15/main/pg_hba.conf"

# Listen on all interfaces
sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" "$PG_CONF"

# Allow connections from local subnet (adjust if your subnet is different)
echo "" >> "$PG_HBA"
echo "# STAP project — allow connections from local network" >> "$PG_HBA"
echo "host    stap_db    stap_user    192.168.1.0/24    scram-sha-256" >> "$PG_HBA"
echo "host    stap_db    stap_user    10.0.0.0/8        scram-sha-256" >> "$PG_HBA"
echo "host    stap_db    stap_user    172.16.0.0/12     scram-sha-256" >> "$PG_HBA"

# ── 6. Restart PostgreSQL ─────────────────────────────────────────────────────
systemctl restart postgresql
echo "✓ PostgreSQL restarted with remote access enabled."

# ── 7. Configure UFW firewall ─────────────────────────────────────────────────
ufw allow ssh
ufw allow 5432/tcp comment "PostgreSQL — STAP project"
ufw --force enable
echo "✓ Firewall: SSH and PostgreSQL (5432) allowed."

# ── 8. Verify setup ───────────────────────────────────────────────────────────
echo ""
echo "========================================"
echo " STAP Database Setup Complete!"
echo "========================================"
echo ""
echo " Container IP  : 192.168.1.125"
echo " PostgreSQL Port: 5432"
echo " Database name : stap_db"
echo " Username      : stap_user"
echo " Password      : Stap@2026!Secure"
echo ""
echo " Connection string:"
echo " postgresql+asyncpg://stap_user:Stap@2026!Secure@192.168.1.125:5432/stap_db"
echo ""
echo " Test connection from your PC:"
echo " psql -h 192.168.1.125 -p 5432 -U stap_user -d stap_db"
echo "========================================"

# ── 9. Create a readonly monitoring user (optional but good practice) ─────────
sudo -u postgres psql <<EOF
\c stap_db
CREATE USER stap_readonly WITH LOGIN PASSWORD 'StapRead@2026';
GRANT CONNECT ON DATABASE stap_db TO stap_readonly;
GRANT USAGE ON SCHEMA public TO stap_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO stap_readonly;
\echo '✓ Read-only user stap_readonly created.'
EOF

echo "✓ All done. Your STAP database container is ready."
