#!/usr/bin/env bash
# Khởi tạo ClinicCybersoftDB trong container Postgres (docker-compose.yml).
# Dùng: ./database/init.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SQL_DIR="$ROOT_DIR/database"
CONTAINER="${POSTGRES_CONTAINER:-postgres}"

set -a
# shellcheck disable=SC1091
source "$ROOT_DIR/.env"
set +a
: "${POSTGRES_USER:?Thiếu POSTGRES_USER trong .env}"
: "${CLINIC_DB_NAME:?Thiếu CLINIC_DB_NAME trong .env}"
: "${CLINIC_DB_USER:?Thiếu CLINIC_DB_USER trong .env}"
: "${CLINIC_DB_PASSWORD:?Thiếu CLINIC_DB_PASSWORD trong .env}"

echo "==> Tạo role \"$CLINIC_DB_USER\" và database \"$CLINIC_DB_NAME\""
docker exec -i "$CONTAINER" psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
  -v db_name="$CLINIC_DB_NAME" -v db_user="$CLINIC_DB_USER" -v db_password="$CLINIC_DB_PASSWORD" \
  < "$SQL_DIR/00_create_db_and_role.sql"

run_as_admin() {
  docker exec -i -e PGPASSWORD="$CLINIC_DB_PASSWORD" "$CONTAINER" \
    psql -q -v ON_ERROR_STOP=1 -h localhost -U "$CLINIC_DB_USER" -d "$CLINIC_DB_NAME" "$@"
}

if [[ "$(run_as_admin -tAc "SELECT to_regclass('public.patients') IS NOT NULL")" == "t" ]]; then
  echo "==> Schema đã tồn tại, bỏ qua 01–03"
else
  for f in 01_schema.sql 02_seed.sql 03_views.sql; do
    echo "==> Chạy $f"
    run_as_admin < "$SQL_DIR/$f"
  done
fi

if [[ "${1:-}" == "--sample" ]]; then
  if [[ "$(run_as_admin -tAc "SELECT count(*) FROM staff")" == "0" ]]; then
    echo "==> Nạp dữ liệu mẫu 04_sample_data.sql"
    run_as_admin < "$SQL_DIR/04_sample_data.sql"
  else
    echo "==> Đã có dữ liệu nhân viên, bỏ qua dữ liệu mẫu"
  fi
fi
echo "==> Xong"
