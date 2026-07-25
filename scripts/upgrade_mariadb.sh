#!/bin/bash
# MariaDB 10.3 -> 11.4 LTS 업그레이드 (Ubuntu 20.04 focal)
# Ubuntu 20.04는 EOL 상태라 MariaDB 자동 setup 스크립트는 거부됨 -> 수동 저장소 추가
# 사용: bash scripts/upgrade_mariadb.sh
set -euo pipefail

BACKUP=/tmp/mariadb_backup_$(date +%Y%m%d_%H%M%S).sql

echo "=== MariaDB Upgrade: -> 11.4 LTS ==="
echo
read -s -p "MariaDB root password (Enter if root uses unix_socket): " ROOTPASS
echo

if [[ -n "$ROOTPASS" ]]; then
  MY="mariadb -uroot -p${ROOTPASS}"
  MYDUMP="mysqldump -uroot -p${ROOTPASS}"
else
  MY="sudo mariadb"
  MYDUMP="sudo mysqldump"
fi

echo "[1/7] Test root connection..."
if ! $MY -e "SELECT VERSION()" 2>&1; then
  echo "ERROR: root login failed. Re-run with correct password."
  exit 1
fi

echo "[2/7] Backing up ALL databases to $BACKUP ..."
$MYDUMP --all-databases --routines --triggers --events > "$BACKUP"
echo "  Saved: $(wc -c < "$BACKUP") bytes"

echo "[3/7] Adding MariaDB 11.4 LTS repository (manual, bypassing EOL check)..."
sudo apt-get install -y apt-transport-https curl ca-certificates
sudo install -d /etc/apt/keyrings
sudo curl -fsSL -o /etc/apt/keyrings/mariadb-keyring.pgp 'https://mariadb.org/mariadb_release_signing_key.pgp'
echo 'deb [signed-by=/etc/apt/keyrings/mariadb-keyring.pgp] https://deb.mariadb.org/11.4/ubuntu focal main' | sudo tee /etc/apt/sources.list.d/mariadb.list

echo "[4/7] apt update..."
sudo apt update

echo "[5/7] Installing new MariaDB (DEBIAN_FRONTEND=noninteractive)..."
sudo DEBIAN_FRONTEND=noninteractive apt install -y \
  -o Dpkg::Options::="--force-confdef" \
  -o Dpkg::Options::="--force-confold" \
  mariadb-server mariadb-client

echo "[6/7] Restarting service..."
sudo systemctl restart mariadb
sleep 2

echo "[7/7] Running mariadb-upgrade..."
if [[ -n "$ROOTPASS" ]]; then
  sudo mariadb-upgrade -uroot -p"$ROOTPASS" --force || true
else
  sudo mariadb-upgrade --force || true
fi

echo
echo "=== DONE ==="
mariadb --version
echo
echo "Backup saved at: $BACKUP"
echo "If you need to roll back, restore from this backup after reinstalling 10.3."
