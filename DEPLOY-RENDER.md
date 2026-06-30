# Free POC deploy: Render (backend) + Supabase (Postgres)

The fastest **free** way to get the backend online with HTTPS — no VM, no domain,
no certificates. Good for a proof of concept. (For a always-on production setup,
see `DEPLOY-OCI.md`.)

```
Frontend  -> GitHub Pages           (already live)
Backend   -> Render free web service (HTTPS at *.onrender.com)
Database  -> Supabase free Postgres
```

**POC limitations:** Render free **sleeps after ~15 min idle** (first request after
that takes ~30–50s to wake). PDF files written to Render's disk are **lost on
redeploy** (paper metadata + AI still work; PDFs can be re-fetched, or wire up
Cloudflare R2 / S3 later via `STORAGE_DRIVER=s3`). Supabase free **pauses a project
after ~7 days idle** (resume with one click in its dashboard).

---

## 1. Create the database (Supabase)
1. https://supabase.com → **New project**. Choose a strong DB password + a region.
2. **Project Settings → Database → Connection string.** Use the **Session pooler**
   (IPv4) details — Render reaches that reliably. You'll get something like:
   - host: `aws-0-<region>.pooler.supabase.com`
   - port: `5432`
   - user: `postgres.<project-ref>`
   - password: the one you set
   - database: `postgres`

The schema **creates itself** on first backend start — no manual SQL needed.

## 2. Deploy the backend (Render)
1. https://render.com → **New → Blueprint** → connect the **greenoccasion-jms** repo.
   Render reads `render.yaml` and proposes the service. (Or **New → Web Service** and
   set: build `npm ci --include=dev && npm run build`, start `npm start`, plan Free.)
2. Fill the secret env vars (the `sync: false` ones) from step 1 + your keys:
   - `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=postgres` (DB_PORT=5432, DB_SSL=true preset)
   - `ADMIN_USERNAME`, `ADMIN_PASSWORD`
   - `GOOGLE_GENAI_API_KEY`, `SEMANTIC_SCHOLAR_API_KEY`, `OPENALEX_MAILTO`, `UNPAYWALL_EMAIL`
   - (Do **not** set `PORT` — Render injects it.)
3. **Create / Deploy.** First build takes a few minutes. You'll get a URL like
   `https://greenoccasion-jms.onrender.com`.
4. Smoke test:
   - `https://greenoccasion-jms.onrender.com/api/papers` → JSON
   - `https://greenoccasion-jms.onrender.com/` → admin portal (log in with ADMIN_*)

## 3. Connect the public site
In the **greenoccasion-web** repo → Settings → Secrets and variables → Actions →
**Variables** → add:
```
VITE_API_BASE_URL = https://greenoccasion-jms.onrender.com
```
Then **Actions → Deploy to GitHub Pages → Re-run**. The live site now shows real data.

> Tip: the first request after the service has been idle is slow (cold start). Just
> refresh — subsequent requests are fast until it idles again.
