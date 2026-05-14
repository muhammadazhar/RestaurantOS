# RestaurantOS On-Premise Deployment Guide

Version: 1.0  
Date: 2026-05-14  
System: RestaurantOS  
Deployment type: Docker-based on-premise server

## 1. Purpose

This guide explains how to install RestaurantOS on another machine using Docker. It is intended for restaurants or operators who want to run RestaurantOS locally on their own server, mini PC, office workstation, or private network.

The on-premise package runs:

- RestaurantOS backend and frontend in one application container.
- PostgreSQL in a separate database container.
- Persistent Docker volumes for database data and uploaded files.
- First-time schema and seed initialization.
- Optional offline-to-cloud sync when cloud credentials are configured.

## 2. Deployment Modes

| Mode | Description | Internet Required |
|---|---|---|
| Fully offline on-premise | Local app and local PostgreSQL only. No cloud sync. | Only for initial Docker image download/build. |
| Local server with cloud sync | Local app works offline, then syncs operational data to cloud when internet is available. | Required for sync only. |
| LAN restaurant server | One local server accessed by POS terminals/tablets over the restaurant network. | Not required after setup unless sync or Cloudinary is used. |

## 3. Server Requirements

Minimum recommended server:

| Resource | Minimum | Recommended |
|---|---:|---:|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB or more |
| Disk | 20 GB free | 80 GB SSD or more |
| OS | Windows 10/11, Windows Server, Ubuntu, Debian, or similar | Ubuntu LTS or Windows Server |
| Software | Docker Desktop or Docker Engine with Compose v2 | Latest stable Docker release |

Network requirements:

- Open the selected application port, default `8080`.
- For LAN use, make sure other POS devices can reach the server IP.
- If cloud sync is enabled, allow outbound HTTPS traffic to the cloud API.

## 4. Package Contents

| Path | Purpose |
|---|---|
| `Dockerfile.onprem` | Builds the production on-premise app image. |
| `deploy/on-prem/docker-compose.yml` | Starts PostgreSQL, initializer, and RestaurantOS app. |
| `deploy/on-prem/.env.example` | Environment template for an on-premise installation. |
| `backend/scripts/onprem-init.js` | First-time database initializer. |
| `deploy/on-prem/scripts/backup.ps1` | Windows PowerShell backup helper. |
| `deploy/on-prem/scripts/restore.ps1` | Windows PowerShell restore helper. |
| `deploy/on-prem/scripts/backup.sh` | Linux/macOS backup helper. |
| `deploy/on-prem/scripts/restore.sh` | Linux/macOS restore helper. |

## 5. Installation Steps

### 5.1 Install Docker

Windows:

1. Install Docker Desktop.
2. Start Docker Desktop.
3. Confirm Docker is running:

```powershell
docker version
docker compose version
```

Linux:

1. Install Docker Engine and Docker Compose v2.
2. Add the deployment user to the Docker group if needed.
3. Confirm Docker is running:

```bash
docker version
docker compose version
```

### 5.2 Copy the RestaurantOS Project

Copy the complete `restaurantos` project folder to the target machine.

Recommended location examples:

| OS | Example Path |
|---|---|
| Windows | `C:\RestaurantOS\restaurantos` |
| Linux | `/opt/restaurantos` |

The project must include the `backend`, `frontend`, `database`, and `deploy/on-prem` folders.

### 5.3 Create the Environment File

From the project root:

Windows PowerShell:

```powershell
Copy-Item deploy\on-prem\.env.example deploy\on-prem\.env
notepad deploy\on-prem\.env
```

Linux/macOS:

```bash
cp deploy/on-prem/.env.example deploy/on-prem/.env
nano deploy/on-prem/.env
```

Change at least these values:

| Variable | Required Change |
|---|---|
| `APP_PUBLIC_URL` | Set to the server URL users will open. Example: `http://192.168.1.50:8080`. |
| `POSTGRES_PASSWORD` | Set a strong database password. |
| `DB_PASSWORD` | Must match `POSTGRES_PASSWORD`. |
| `JWT_SECRET` | Set a long random value. |
| `JWT_REFRESH_SECRET` | Set a different long random value. |
| `DEVICE_ID` | Unique device/server ID, for example `BRANCH01-SERVER`. |
| `BRANCH_CODE` | Branch code, for example `MAIN` or `BRANCH01`. |

Important:

- Keep `.env` private.
- Do not send `.env` to normal users.
- Do not commit `.env` to source control.

### 5.4 Start RestaurantOS

From the on-premise deployment folder:

Windows PowerShell:

```powershell
cd deploy\on-prem
docker compose up -d --build
```

Linux/macOS:

```bash
cd deploy/on-prem
docker compose up -d --build
```

The first run will:

1. Build the RestaurantOS app image.
2. Start PostgreSQL.
3. Run database migrations and seed data if the database is empty.
4. Start the application.

### 5.5 Confirm Services

```bash
docker compose ps
```

Expected services:

| Service | Expected State |
|---|---|
| `db` | Healthy / running |
| `init` | Exited successfully after first-time initialization |
| `app` | Running / healthy |

Health check:

```bash
curl http://localhost:8080/api/health
```

Expected response:

```json
{"status":"ok"}
```

## 6. Access URLs

Default local URL:

```text
http://localhost:8080
```

LAN URL example:

```text
http://192.168.1.50:8080
```

Restaurant login:

```text
http://SERVER-IP:8080/login
```

Super admin login:

```text
http://SERVER-IP:8080/super-admin
```

Only provide the super-admin URL to platform administrators.

## 7. Default Seed Access

If `RUN_SEED_DATA=true`, seed data is loaded on the first install.

Default super-admin seed:

| Field | Value |
|---|---|
| Email | `superadmin@restaurantos.com` |
| Password | `password123` |

Change this password immediately after setup.

Seed restaurant users depend on the seed data in `database/seeds/001_seed_data.sql`.

## 8. Updating an Existing On-Premise Install

1. Copy the updated project files to the server.
2. Keep the existing `deploy/on-prem/.env`.
3. Rebuild and restart:

```bash
cd deploy/on-prem
docker compose up -d --build
```

Existing PostgreSQL data and uploads are preserved because they are stored in Docker volumes.

Before major updates, create a backup.

## 9. Backup

Windows PowerShell:

```powershell
cd deploy\on-prem
.\scripts\backup.ps1
```

Linux/macOS:

```bash
cd deploy/on-prem
sh ./scripts/backup.sh
```

Backups are written to `deploy/on-prem/backups` by default.

Recommended backup policy:

| Frequency | Retention |
|---|---|
| Daily | 7 days |
| Weekly | 4 weeks |
| Monthly | 12 months |

Also back up uploaded files if the restaurant stores important local images or documents. Uploaded files are stored in the Docker volume `restaurantos_onprem_uploads`.

## 10. Restore

Stop the application before restore:

```bash
cd deploy/on-prem
docker compose stop app
```

Windows PowerShell:

```powershell
.\scripts\restore.ps1 -BackupFile .\backups\restaurantos-YYYYMMDD-HHMMSS.sql
docker compose start app
```

Linux/macOS:

```bash
sh ./scripts/restore.sh ./backups/restaurantos-YYYYMMDD-HHMMSS.sql
docker compose start app
```

## 11. Optional Cloud Sync Configuration

For a local server that should sync with the cloud backend, configure these values in `deploy/on-prem/.env`:

```text
CLOUD_API_URL=https://restaurantos-production-bdb7.up.railway.app
CLOUD_SYNC_TOKEN=your_shared_sync_token
SYNC_WORKER_INTERVAL_MS=15000
MASTER_SYNC_PULL_INTERVAL_MS=60000
```

The same `CLOUD_SYNC_TOKEN` must exist on the cloud backend.

Sync behavior:

- POS/orders, shifts, attendance, table status, and subscription requests are queued locally and pushed to cloud.
- Master data remains cloud-owned and pulls down to the local server.
- Menu item images can be cached locally for offline use.

Leave `CLOUD_API_URL` and `CLOUD_SYNC_TOKEN` blank for a fully offline installation.

## 12. Operations Commands

Start:

```bash
docker compose up -d
```

Stop:

```bash
docker compose down
```

Restart app only:

```bash
docker compose restart app
```

View logs:

```bash
docker compose logs -f app
```

View database logs:

```bash
docker compose logs -f db
```

Check health:

```bash
docker compose ps
curl http://localhost:8080/api/health
```

## 13. Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| Browser cannot open the app | Wrong port or firewall blocked | Confirm `APP_PORT`, Docker status, and firewall rule. |
| Other devices cannot open app | `APP_PUBLIC_URL` uses localhost | Set `APP_PUBLIC_URL` to server IP/DNS and rebuild. |
| App container restarts | Database credentials mismatch | Make `POSTGRES_PASSWORD` and `DB_PASSWORD` match. |
| Init container failed | Existing partial schema or invalid seed | Check `docker compose logs init`; restore from backup or recreate volumes only if data can be lost. |
| Login works on server but not POS terminals | CORS/client URL mismatch | Set `APP_PUBLIC_URL` to the LAN URL and rebuild. |
| Images missing offline | Cloud images not localized yet | Enable internet temporarily and let master data/image cache complete. |
| Sync pending does not clear | Cloud API/token not configured or cloud unavailable | Check `CLOUD_API_URL`, `CLOUD_SYNC_TOKEN`, internet, and cloud backend logs. |

## 14. Data Safety Notes

- Never delete Docker volumes unless you intentionally want to erase local data.
- Always back up before updating.
- Store backups outside the same machine when possible.
- Keep `.env` secure because it contains database and JWT secrets.
- For production restaurants, change all seed passwords immediately.

## 15. Recommended Production Checklist

| Item | Status |
|---|---|
| Docker installed and starts automatically | Pending |
| `.env` created with strong secrets | Pending |
| Server static IP or DNS configured | Pending |
| Firewall allows only required app port | Pending |
| Super-admin password changed | Pending |
| Restaurant admin users created | Pending |
| Backup schedule configured | Pending |
| Restore tested | Pending |
| Optional cloud sync token configured | Pending |
| POS devices tested over LAN | Pending |
