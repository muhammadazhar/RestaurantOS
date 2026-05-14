#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
OUT_DIR="${1:-$ROOT/backups}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing .env file. Copy .env.example to .env first." >&2
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="$OUT_DIR/restaurantos-$STAMP.sql"

docker compose --env-file "$ENV_FILE" -f "$ROOT/docker-compose.yml" exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner > "$TARGET"

echo "Backup created: $TARGET"
