#!/usr/bin/env bash
#
# Copies the local Docker database into a remote Postgres (Neon).
#
#   npm run db:copy-to-remote -w @yuva/api
#
# Reads the target from DIRECT_URL in apps/api/.env — never from an argument,
# so the connection string stays out of shell history and process listings.
#
# Run `npx prisma migrate deploy` against the remote FIRST. This script copies
# rows only; it does not create tables, so the schema must already match.
#
set -euo pipefail

API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Neon lives in its own file so the local .env can stay pointed at Docker.
ENV_FILE="$API_DIR/.env.neon"
[[ -f "$ENV_FILE" ]] || ENV_FILE="$API_DIR/.env"
CONTAINER="yuva-postgres"
LOCAL_URL="postgresql://yuva:yuva@localhost:5432/yuva_polyprint"

# Tables in dependency order. pg_dump --data-only emits tables ALPHABETICALLY,
# which would try to insert jobs before the customers they reference and fail
# on the foreign key. Dumping one table at a time in this order avoids that.
TABLES=(
  app_settings
  materials
  material_rates
  customers
  jobs
  quotations
  quotation_items
)

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: no .env.neon or .env found in $API_DIR" >&2
  echo "       Copy .env.neon.example to .env.neon and paste your Neon URLs in." >&2
  exit 1
fi

# `|| true` matters: under `set -e` a non-matching grep would kill the script
# before the helpful message below ever prints.
RAW_LINE="$(grep -E '^DIRECT_URL=' "$ENV_FILE" | head -1 || true)"
TARGET_URL="${RAW_LINE#DIRECT_URL=}"
TARGET_URL="${TARGET_URL%\"}"
TARGET_URL="${TARGET_URL#\"}"
TARGET_URL="$(printf '%s' "$TARGET_URL" | xargs || true)"

if [[ -z "$TARGET_URL" ]]; then
  echo "error: DIRECT_URL is not set in $ENV_FILE" >&2
  echo "       Copy .env.neon.example to .env.neon and paste your Neon URLs in." >&2
  exit 1
fi

# Show enough to confirm the right database without revealing the password.
SAFE_TARGET="$(printf '%s' "$TARGET_URL" | sed -E 's#//[^:]+:[^@]+@#//***:***@#')"
echo "Source : local Docker ($CONTAINER)"
echo "Target : $SAFE_TARGET"
echo

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "error: the $CONTAINER container is not running. Start it with: npm run db:up" >&2
  exit 1
fi

echo "Checking the target is reachable and empty…"
EXISTING="$(docker exec -i "$CONTAINER" psql "$TARGET_URL" -tAc \
  "SELECT COALESCE(SUM(n_live_tup), 0) FROM pg_stat_user_tables WHERE schemaname='public' AND relname <> '_prisma_migrations';")"

if [[ "${EXISTING//[[:space:]]/}" != "0" ]]; then
  echo
  echo "error: the target already holds $EXISTING row(s)." >&2
  echo "       Refusing to copy on top of existing data — it would duplicate rows" >&2
  echo "       or fail on unique keys. Empty the target first if that is what you want." >&2
  exit 1
fi

DUMP="/tmp/yuva-data-$(date +%Y%m%d-%H%M%S).sql"
echo "Dumping ${#TABLES[@]} tables in dependency order…"

: > "$DUMP"
for table in "${TABLES[@]}"; do
  docker exec -i "$CONTAINER" pg_dump "$LOCAL_URL" \
    --data-only --no-owner --no-privileges --no-comments \
    --table="public.$table" >> "$DUMP"
done

echo "Dump written: $DUMP ($(wc -l < "$DUMP" | xargs) lines)"
echo "Restoring…"

# One transaction: a partial copy is worse than none, because the refusal check
# above would then block a clean retry.
docker exec -i "$CONTAINER" psql "$TARGET_URL" \
  --single-transaction --set ON_ERROR_STOP=on < "$DUMP" > /dev/null

echo
echo "Row counts after copy:"
for table in "${TABLES[@]}"; do
  local_count="$(docker exec -i "$CONTAINER" psql "$LOCAL_URL" -tAc "SELECT count(*) FROM $table;")"
  remote_count="$(docker exec -i "$CONTAINER" psql "$TARGET_URL" -tAc "SELECT count(*) FROM $table;")"
  status="ok"
  [[ "$local_count" != "$remote_count" ]] && status="MISMATCH"
  printf '  %-16s local %-6s remote %-6s %s\n' "$table" "$local_count" "$remote_count" "$status"
done

echo
echo "Done. The dump is kept at $DUMP — delete it when you are satisfied."
