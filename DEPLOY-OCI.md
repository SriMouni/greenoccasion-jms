# Deploying the JMS portal to Oracle Cloud (OCI Always Free)

This stands up the **backend API + admin UI** on a free Oracle Cloud VM, reachable
at `http://<vm-ip>:3001`. HTTPS + a domain come later (see the last section); this
guide gets it **running over plain HTTP first** as a smoke test.

The portal is one process: the backend (`backend/server.ts`) serves the API **and**
the built admin SPA (`frontend/dist`). Jobs run in-process (`JOB_RUNNER=inline`), so
there's no separate worker or Redis to run.

---

## 1. Create the VM (OCI Console — one-time)

1. **Compute → Instances → Create instance.**
2. **Image & shape:** Ubuntu 22.04. Shape = **Ampere (VM.Standard.A1.Flex)** — the
   Always-Free ARM shape (pick e.g. 1 OCPU / 6 GB, or up to 4 / 24 GB free). If A1
   capacity is unavailable in your region, use **VM.Standard.E2.1.Micro** (AMD, also free).
3. **SSH keys:** upload your public key (or let OCI generate one and download it).
4. Create it, then copy the instance's **Public IP address**.

## 2. Open port 3001 in the OCI cloud firewall (the #1 missed step)

OCI blocks inbound traffic at the **network** level regardless of the VM's own firewall:

1. Open your instance → click its **Virtual Cloud Network (VCN)**.
2. **Security Lists → Default Security List → Add Ingress Rules.**
3. Add: **Source `0.0.0.0/0`**, IP Protocol **TCP**, **Destination Port `3001`**. Save.

(The `setup.sh` script opens 3001 in the VM's *own* iptables; this step opens the
*cloud* firewall. You need **both**.)

## 3. SSH in and clone

```bash
ssh ubuntu@<vm-ip>
git clone https://github.com/<your-user>/greenoccasion-jms.git
cd greenoccasion-jms
```

## 4. Create `.env`

```bash
cp .env.example .env
nano .env
```
Set real values — at minimum:
- `NODE_ENV=production`
- `DB_PASSWORD=` a strong password (remember it for the next step)
- `DB_HOST=127.0.0.1`, `DB_SSL=false`
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` (your first admin login)
- `GOOGLE_GENAI_API_KEY`, `SEMANTIC_SCHOLAR_API_KEY` (copy from your local `.env`)

## 5. Run the setup script

Installs Node 22 + PostgreSQL + build tools, creates the DB/role, opens the host
firewall, installs deps, and builds the frontend. Pass the **same** `DB_PASSWORD`
you put in `.env`:

```bash
DB_PASSWORD='the-same-password-as-in-.env' bash deploy/setup.sh
```

## 6. Install + start the service

```bash
sudo cp deploy/greenoccasion-jms.service /etc/systemd/system/
# If you cloned somewhere other than /home/ubuntu/greenoccasion-jms, edit the
# User= and WorkingDirectory= lines first.
sudo systemctl daemon-reload
sudo systemctl enable --now greenoccasion-jms
```

## 7. Smoke test

```bash
# on the VM:
curl http://localhost:3001/api/papers          # -> JSON
sudo journalctl -u greenoccasion-jms -f         # live logs

# from your laptop browser:
http://<vm-ip>:3001/                            # admin portal (log in with ADMIN_*)
http://<vm-ip>:3001/api/papers                  # API
```

The database starts **empty** — the schema auto-creates on first start. Use the
admin **Discovery** workflow to ingest papers (it re-downloads PDFs into
`backend/uploads/`, which is intentionally not in git).

### Updating later
```bash
cd ~/greenoccasion-jms && git pull && npm ci && npm run build
sudo systemctl restart greenoccasion-jms
```

---

## Next: HTTPS + domain (required — the public site is HTTPS)

The public site (GitHub Pages) is served over HTTPS, and a browser on an HTTPS page
**cannot** call a plain `http://` backend (mixed content is blocked). So once the
HTTP smoke test passes, add HTTPS via **Caddy** (automatic Let's Encrypt).

### 8. Point a subdomain at the VM
Add a DNS **A record** at wherever `greenoccasion.in` is managed:
```
api.greenoccasion.in   ->   <vm-ip>
```

### 9. Open ports 80 + 443 in the OCI cloud firewall
VCN → Security List → Add Ingress: Source `0.0.0.0/0`, TCP, ports **80** and **443**
(same place you opened 3001 in step 2).

### 10. Install Caddy
```bash
cd ~/greenoccasion-jms
DOMAIN=api.greenoccasion.in bash deploy/setup-https.sh
```
This installs Caddy, writes `/etc/caddy/Caddyfile` (reverse-proxy → `localhost:3001`),
opens 80/443 in the host firewall, and starts Caddy. It fetches the TLS cert on the
first request (~30s). Test:
```bash
curl https://api.greenoccasion.in/api/papers
```
Now the admin portal is at `https://api.greenoccasion.in/` and the API at `/api`.

### 11. Connect the public site
In the **greenoccasion-web** repo → Settings → Secrets and variables → Actions →
**Variables** → add `VITE_API_BASE_URL = https://api.greenoccasion.in`. Then re-run
the **Deploy to GitHub Pages** workflow. The live site now loads real data.

> Tip: you can keep the `PORT=3001` backend bound only to localhost and let Caddy be
> the only public listener (close 3001 in the firewalls) for a tidier setup.
