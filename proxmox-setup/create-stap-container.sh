#!/bin/bash
# ============================================================
# STAP — Proxmox LXC Container Setup Script
# Run this on your Proxmox node (pve2) via the Shell tab
# ============================================================
#
# This creates a dedicated Ubuntu 22.04 LXC container for STAP
# Container ID : 125
# IP Address   : 192.168.1.125/24  ← CHANGE to match your subnet
# Gateway      : 192.168.1.1       ← CHANGE to your router IP
# Hostname     : stap-db
# ============================================================

# ── Step 1: Download Ubuntu 22.04 template (if not already there) ──────────
pveam update
pveam download local ubuntu-22.04-standard_22.04-1_amd64.tar.zst

# ── Step 2: Create the STAP LXC container ──────────────────────────────────
pct create 125 local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst \
  --hostname stap-db \
  --password "Stap@2026!DB" \
  --cores 2 \
  --memory 2048 \
  --swap 512 \
  --storage local-lvm \
  --rootfs local-lvm:20 \
  --net0 name=eth0,bridge=vmbr0,ip=192.168.1.125/24,gw=192.168.1.1 \
  --nameserver 8.8.8.8 \
  --features nesting=1 \
  --unprivileged 1 \
  --onboot 1

# ── Step 3: Start the container ─────────────────────────────────────────────
pct start 125

# Wait for it to boot
sleep 5

echo ""
echo "============================================================"
echo "Container 125 (stap-db) created and started."
echo "IP Address : 192.168.1.125"
echo "Root pass  : Stap@2026!DB"
echo ""
echo "Now run the database setup script inside the container:"
echo "  pct exec 125 -- bash /tmp/setup-postgres.sh"
echo "  (after uploading setup-postgres.sh)"
echo "============================================================"
