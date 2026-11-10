#!/usr/bin/env bash
# Đưa ClinicCybersoftDB từ Postgres local (Docker) lên Postgres online (Neon...) — schema + dữ liệu hiện có.
# Cần DATABASE_URL (DB đích) trong .env.production, vd:
#   postgresql://<user>:<pass>@<host>/ClinicCybersoftDB?sslmode=verify-full
# Dùng: ./database/deploy-remote.sh            (dừng nếu DB đích đã có dữ liệu)
#       ./database/deploy-remote.sh --force    (XÓA toàn bộ schema public của DB đích rồi nạp lại)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONTAINER="${POSTGRES_CONTAINER:-postgres}"

set -a
# shellcheck disable=SC1091
source "$ROOT_DIR/.env"
# shellcheck disable=SC1091
source "$ROOT_DIR/.env.production"
set +a
: "${DATABASE_URL:?Thiếu DATABASE_URL trong .env.production}"
SOURCE_DB="${SOURCE_DB:-$CLINIC_DB_NAME}"

# psql trong container không có kho CA cho verify-full → dùng sslmode=require (vẫn mã hóa) cho bước nạp dữ liệu
url_with_db() { node -e 'const u=new URL(process.argv[1]);u.pathname="/"+encodeURIComponent(process.argv[2]);if(u.searchParams.has("sslmode"))u.searchParams.set("sslmode","require");console.log(u.toString())' "$DATABASE_URL" "$1"; }
TARGET_DB="$(node -e 'console.log(decodeURIComponent(new URL(process.argv[1]).pathname.slice(1)))' "$DATABASE_URL")"
ADMIN_URL="$(url_with_db "${REMOTE_ADMIN_DB:-neondb}")"
DATABASE_URL="$(url_with_db "$TARGET_DB")"
HOST="$(node -e 'console.log(new URL(process.argv[1]).hostname)' "$DATABASE_URL")"

# Dùng psql/pg_dump có sẵn trong container Postgres 17 local
remote() { docker exec -i "$CONTAINER" psql -q -X -v ON_ERROR_STOP=1 "$@"; }

echo "==> Nguồn: $SOURCE_DB (local) → Đích: $TARGET_DB @ $HOST"

if [[ "$(remote "$ADMIN_URL" -tAc "SELECT 1 FROM pg_database WHERE datname = '$TARGET_DB'")" != "1" ]]; then
  echo "==> Tạo database $TARGET_DB (collation tiếng Việt ICU vi-VN)"
  remote "$ADMIN_URL" -c "CREATE DATABASE \"$TARGET_DB\" TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'vi-VN' LOCALE 'C.UTF-8'" \
    || { echo "    ICU không hỗ trợ → tạo với collation mặc định"; remote "$ADMIN_URL" -c "CREATE DATABASE \"$TARGET_DB\""; }
fi
remote "$DATABASE_URL" -c "ALTER DATABASE \"$TARGET_DB\" SET timezone TO 'Asia/Ho_Chi_Minh'"

if [[ "$(remote "$DATABASE_URL" -tAc "SELECT to_regclass('public.patients') IS NOT NULL")" == "t" ]]; then
  if [[ "${1:-}" != "--force" ]]; then
    echo "!! DB đích đã có schema. Chạy lại với --force để xóa và nạp lại." >&2
    exit 1
  fi
  echo "==> --force: xóa schema public của DB đích"
  remote "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
fi

echo "==> Dump $SOURCE_DB và nạp lên $TARGET_DB"
# Bỏ owner/quyền (role local không tồn tại trên host) và COMMENT ON EXTENSION (cần superuser)
docker exec "$CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$SOURCE_DB" --no-owner --no-acl \
  | sed '/^COMMENT ON EXTENSION/d' \
  | remote "$DATABASE_URL" --single-transaction >/dev/null

echo "==> Kiểm tra số dòng"
remote "$DATABASE_URL" -c "SELECT 'staff' AS bang, count(*) FROM staff
  UNION ALL SELECT 'patients', count(*) FROM patients
  UNION ALL SELECT 'appointments', count(*) FROM appointments
  UNION ALL SELECT 'invoices', count(*) FROM invoices"
echo "==> Xong"
