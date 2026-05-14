# RestaurantOS On-Premise Docker Deployment

This folder contains the self-contained Docker deployment for installing RestaurantOS on another machine.

## Quick Start

1. Copy `.env.example` to `.env`.
2. Edit `.env` and set:
   - `APP_PUBLIC_URL`
   - `POSTGRES_PASSWORD`
   - `DB_PASSWORD`
   - `JWT_SECRET`
   - `JWT_REFRESH_SECRET`
3. Start the stack:

```bash
docker compose up -d --build
```

4. Open:

```text
http://localhost:8080
```

For full instructions, read:

```text
docs/ON_PREMISE_DEPLOYMENT.md
```

## Services

| Service | Description |
|---|---|
| `db` | PostgreSQL database. |
| `init` | First-time schema and seed initializer. |
| `app` | RestaurantOS backend, frontend, Socket.IO, uploads, and sync worker. |

## Backup

Windows:

```powershell
.\scripts\backup.ps1
```

Linux/macOS:

```bash
sh ./scripts/backup.sh
```
