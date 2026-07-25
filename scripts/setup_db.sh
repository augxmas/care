#!/bin/bash
# advertise DB / advertiser user 생성 후 dump.sql 임포트
# 사전조건: root 권한이 있는 MariaDB(또는 MySQL) 서버가 로컬에서 동작
# 사용: bash scripts/setup_db.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DUMP_FILE="$REPO_DIR/database/dump.sql"

if [[ ! -f "$DUMP_FILE" ]]; then
  echo "ERROR: dump.sql not found at $DUMP_FILE" >&2
  exit 1
fi

read -s -p "Set advertiser DB password: " DBPASS
echo
if [[ -z "$DBPASS" ]]; then
  echo "ERROR: empty password" >&2
  exit 1
fi

echo "[1/3] Creating database and user..."
sudo mariadb <<SQL
CREATE DATABASE IF NOT EXISTS advertise CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'advertiser'@'%' IDENTIFIED BY '${DBPASS}';
CREATE USER IF NOT EXISTS 'advertiser'@'localhost' IDENTIFIED BY '${DBPASS}';
ALTER USER 'advertiser'@'%' IDENTIFIED BY '${DBPASS}';
ALTER USER 'advertiser'@'localhost' IDENTIFIED BY '${DBPASS}';
GRANT ALL PRIVILEGES ON advertise.* TO 'advertiser'@'%';
GRANT ALL PRIVILEGES ON advertise.* TO 'advertiser'@'localhost';
FLUSH PRIVILEGES;
SQL

echo "[2/3] Importing dump.sql..."
sudo mariadb advertise < "$DUMP_FILE"

echo "[3/3] Verifying..."
sudo mariadb advertise -e "SHOW TABLES; SELECT COUNT(*) AS advertiser_count FROM advertisers; SELECT fn_encrypt('test') AS encrypt_test;"

echo
echo "DONE. DB=advertise USER=advertiser HOST=localhost"
