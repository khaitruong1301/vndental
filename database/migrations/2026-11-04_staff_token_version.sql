-- Phiên đăng nhập hết hiệu lực khi đổi mật khẩu / khóa tài khoản (QA 04/11/2026)
\set ON_ERROR_STOP on
BEGIN;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN staff.token_version IS 'Tăng khi đổi mật khẩu / khóa tài khoản → mọi phiên đăng nhập cũ (JWT) hết hiệu lực.';
CREATE OR REPLACE FUNCTION trg_staff_token_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.password_hash IS DISTINCT FROM OLD.password_hash OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    NEW.token_version := OLD.token_version + 1;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bump_token_version ON staff;
CREATE TRIGGER bump_token_version BEFORE UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION trg_staff_token_version();
COMMIT;
