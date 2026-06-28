#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# Provision an Oracle Cloud (OCI) Always-Free Ubuntu VM to run the
# Green Occasion JMS portal (API + admin UI). Works on Ampere ARM or AMD.
#
# Run from the repo root on the VM:
#   DB_PASSWORD='your-strong-pw' bash deploy/setup.sh
#
# Idempotent: safe to re-run. It installs Node + Postgres + build tools,
# creates the database/role, opens port 3001 in the host firewall, then
# installs deps and builds the frontend. It does NOT start the service
# (see DEPLOY-OCI.md for the systemd step) and never touches your .env.
# ──────────────────────────────────────────────────────────────────────────
set -euo pipefail

NODE_MAJOR=22
DB_NAME="${DB_NAME:-greenocc_library}"
DB_USER="${DB_USER:-greenocc}"
DB_PASSWORD="${DB_PASSWORD:-}"
APP_PORT="${APP_PORT:-3001}"

if [ -z "$DB_PASSWORD" ]; then
  echo "!! Set DB_PASSWORD (must match DB_PASSWORD in your .env), e.g.:"
  echo "   DB_PASSWORD='your-strong-pw' bash deploy/setup.sh"
  exit 1
fi

echo ">> [1/6] Base packages"
sudo apt-get update -y
sudo apt-get install -y curl ca-certificates git build-essential python3

echo ">> [2/6] Node.js ${NODE_MAJOR}"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v//;s/\..*//')" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "   node $(node -v), npm $(npm -v)"

echo ">> [3/6] PostgreSQL"
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql

echo ">> [4/6] Database + role (idempotent)"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';
  ELSE
    ALTER ROLE ${DB_USER} PASSWORD '${DB_PASSWORD}';
  END IF;
END \$\$;
SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec
SQL
echo "   db '${DB_NAME}' owned by '${DB_USER}' ready (schema auto-creates on first start)"

echo ">> [5/6] Host firewall: allow TCP ${APP_PORT}"
# OCI Ubuntu images ship with a restrictive iptables INPUT chain ending in REJECT.
# Insert an ACCEPT for the app port before that REJECT, then persist.
if sudo iptables -C INPUT -p tcp --dport "${APP_PORT}" -j ACCEPT 2>/dev/null; then
  echo "   rule already present"
else
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport "${APP_PORT}" -j ACCEPT
  sudo apt-get install -y iptables-persistent >/dev/null 2>&1 || true
  sudo netfilter-persistent save 2>/dev/null || sudo sh -c 'iptables-save > /etc/iptables/rules.v4' 2>/dev/null || true
  echo "   added + persisted"
fi
echo "   NOTE: you ALSO must open ${APP_PORT} in the OCI cloud firewall"
echo "         (VCN > Security List > Ingress Rules). See DEPLOY-OCI.md."

echo ">> [6/6] Install deps + build frontend"
npm ci
npm run build

echo ""
echo ">> Done. Next: create .env (cp .env.example .env && edit), then install the service:"
echo "     sudo cp deploy/greenoccasion-jms.service /etc/systemd/system/"
echo "     sudo systemctl daemon-reload && sudo systemctl enable --now greenoccasion-jms"
echo "     curl http://localhost:${APP_PORT}/api/papers"
