#!/usr/bin/env bash
# Simulates upgrading a database created before the generic model, the same
# way production does it (prisma migrate deploy), then generates a schedule.
# Requires DATABASE_URL pointing at an EMPTY disposable database and psql.
set -euo pipefail
cd "$(dirname "$0")/.."
NEW=prisma/migrations/20261031000000_generic_model
HOLD=$(mktemp -d)
mv "$NEW" "$HOLD/"
trap 'mv "$HOLD/$(basename $NEW)" prisma/migrations/ 2>/dev/null || true' EXIT
npx prisma migrate deploy
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f tests/legacy-fixture.sql
mv "$HOLD/$(basename $NEW)" prisma/migrations/
npx prisma migrate deploy
npx tsx tests/legacy-upgrade-check.ts
