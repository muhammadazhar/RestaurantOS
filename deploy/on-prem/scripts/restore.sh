#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: ./scripts/restore.sh /path/to/restaurantos.dump" >&2
  exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing .env file. Copy .env.example to .env first." >&2
  exit 1
fi
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

cat "$BACKUP_FILE" | docker compose --env-file "$ENV_FILE" -f "$ROOT/docker-compose.yml" exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo "Restore completed from: $BACKUP_FILE"
