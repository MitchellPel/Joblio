# Joblio lean self-host (Docker)

Postgres + PostgREST + a tiny nginx gateway on the office server.
**Not** hosted Supabase. Proof images stay on the Windows share.

Staff SQLite (`jobs.db`) is untouched until you cut over on purpose.

## 1. On the office server

1. Install Docker Desktop (or Docker Engine).
2. Copy this whole `self-host` folder onto the server (e.g. `C:\Joblio-selfhost\`).
3. In that folder:

```bat
copy .env.example .env
notepad .env
```

Set a strong `POSTGRES_PASSWORD`, save, then:

```bat
docker compose up -d
```

4. Check:

```bat
curl http://127.0.0.1:8080/health
```

You should see `joblio-ok`.

API from other PCs on the LAN (use your server IP):

```text
http://192.168.1.107:8080
```

## 2. Point Joblio test mode at it

On your **dev PC**, create `.env.selfhost` in the repo root:

```env
JOBLIO_API_URL=http://192.168.1.107:8080
JOBLIO_API_KEY=joblio-local
JOBLIO_PROOFS_DIR=\\server\Gary\Job Tracker\proofs
```

Then:

```bat
npm run dev:selfhost
```

Login banner: **LAN SELF-HOST**.

## 3. Load data (once)

```bat
npm run migrate:selfhost
```

Reads a **copy** of `jobs.db` and fills Docker Postgres. Does not modify staff `jobs.db`.

## 4. Day-to-day

```bat
docker compose ps
docker compose logs -f --tail=100
docker compose down
docker compose up -d
```

Backup example:

```bat
docker compose exec -T db pg_dump -U joblio joblio > backup.sql
```

## Security

- Keep **8080/5432 off the public internet** (office LAN only).
- Boss overseas still needs VPN/tunnel later if you stay LAN-only.

## Reset Docker DB only

```bat
docker compose down -v
docker compose up -d
```
