#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

sudo install -m 0644 hospital-crm-dev.service /etc/systemd/system/
sudo install -m 0644 hospital-crm-ngrok.service /etc/systemd/system/

sudo systemctl daemon-reload
sudo systemctl enable --now hospital-crm-dev.service
sudo systemctl enable --now hospital-crm-ngrok.service

sudo systemctl --no-pager --full status hospital-crm-dev.service hospital-crm-ngrok.service
