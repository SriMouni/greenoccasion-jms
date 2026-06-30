#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# Put Caddy in front of the JMS backend (localhost:3001) for automatic HTTPS.
# Caddy fetches + renews a Let's Encrypt certificate with zero extra config.
#
# DO THESE FIRST:
#   1. DNS: add an A record  <your-subdomain>  ->  this VM's public IP
#      e.g.  api.greenoccasion.in  ->  140.x.x.x
#   2. Open ports 80 AND 443 in the OCI cloud firewall
#      (VCN > Security List > Ingress, Source 0.0.0.0/0, TCP 80 and 443).
#
# Run from the repo root on the VM:
#   DOMAIN=api.greenoccasion.in bash deploy/setup-https.sh
# ──────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMAIN="${DOMAIN:-}"
if [ -z "$DOMAIN" ]; then
  echo "!! Set DOMAIN, e.g.: DOMAIN=api.greenoccasion.in bash deploy/setup-https.sh"
  exit 1
fi

echo ">> [1/4] Installing Caddy"
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
sudo apt-get update -y
sudo apt-get install -y caddy

echo ">> [2/4] Writing /etc/caddy/Caddyfile for ${DOMAIN}"
sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
${DOMAIN} {
    reverse_proxy localhost:3001
}
EOF

echo ">> [3/4] Opening ports 80 + 443 in the host firewall"
for p in 80 443; do
  if ! sudo iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null; then
    sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport "$p" -j ACCEPT
  fi
done
sudo netfilter-persistent save 2>/dev/null || sudo sh -c 'iptables-save > /etc/iptables/rules.v4' 2>/dev/null || true

echo ">> [4/4] Starting Caddy"
sudo systemctl enable caddy
sudo systemctl restart caddy

echo ""
echo ">> Done. Caddy will fetch the TLS cert on first hit (give it ~30s), then:"
echo "     curl https://${DOMAIN}/api/papers"
echo "   If it hangs, you almost certainly forgot to open 80+443 in the OCI"
echo "   cloud firewall (VCN Security List) — that is separate from this host firewall."
