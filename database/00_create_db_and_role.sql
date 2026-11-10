-- =============================================================================
-- 00. Tạo role admin + database cho ứng dụng phòng khám
-- Chạy bằng superuser trên DB "postgres", truyền biến qua psql:
--   psql -v db_name=... -v db_user=... -v db_password=... -f 00_create_db_and_role.sql
-- Script idempotent: chạy lại chỉ đồng bộ lại mật khẩu, không tạo trùng.
-- =============================================================================
\set ON_ERROR_STOP on

-- Role admin của DB (không phải superuser của cả cluster)
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'db_user', :'db_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'db_user') \gexec

SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'db_user', :'db_password') \gexec

-- Database, collation tiếng Việt (ICU) để sắp xếp tên bệnh nhân đúng thứ tự
SELECT format(
  'CREATE DATABASE %I OWNER %I ENCODING ''UTF8'' TEMPLATE template0 LOCALE_PROVIDER icu ICU_LOCALE ''vi-VN''',
  :'db_name', :'db_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db_name') \gexec

SELECT format('ALTER DATABASE %I OWNER TO %I', :'db_name', :'db_user') \gexec
SELECT format('ALTER DATABASE %I SET timezone TO ''Asia/Ho_Chi_Minh''', :'db_name') \gexec

-- Chỉ admin được kết nối vào DB này
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db_name') \gexec
SELECT format('GRANT ALL PRIVILEGES ON DATABASE %I TO %I', :'db_name', :'db_user') \gexec
