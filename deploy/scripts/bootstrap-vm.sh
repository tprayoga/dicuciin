#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -eq 0 ]]; then
  echo "Run as regular user with sudo access, not as root."
  exit 1
fi

echo "==> Update system packages"
sudo apt update && sudo apt upgrade -y

echo "==> Install base packages"
sudo apt install -y git curl nginx certbot python3-certbot-nginx build-essential

echo "==> Install Node.js 20"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

echo "==> Install PM2"
sudo npm i -g pm2

echo "==> Install Docker"
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker "$USER"

echo "==> Enable services"
sudo systemctl enable --now nginx
sudo systemctl enable --now docker

echo "==> Done. Log out and log back in so docker group applies."
