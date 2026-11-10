-- Sửa lỗi sau QA tích hợp 04/11/2026 — áp dụng cho DB đã tạo trước đó (01_schema.sql đã chứa sẵn bản mới)
\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION fmt_qty(n numeric) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT replace(trim_scale(n)::text, '.', ',')
$$;

CREATE OR REPLACE FUNCTION trg_appointments_validate() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_start timestamp := clinic_local(NEW.start_at);
  v_end   timestamp := clinic_local(NEW.end_at);
BEGIN
  IF NEW.status = 'CANCELLED' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.doctor_id = OLD.doctor_id AND NEW.chair_id = OLD.chair_id
     AND NEW.start_at = OLD.start_at THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM staff s JOIN roles r ON r.id = s.role_id
                 WHERE s.id = NEW.doctor_id AND r.code = 'DOCTOR' AND s.is_active) THEN
    RAISE EXCEPTION 'Nhân viên % không phải bác sĩ đang làm việc', NEW.doctor_id USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM chairs WHERE id = NEW.chair_id AND is_active) THEN
    RAISE EXCEPTION 'Ghế % không hoạt động', NEW.chair_id USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM doctor_shifts ds
                 WHERE ds.doctor_id = NEW.doctor_id
                   AND ds.work_date = v_start::date
                   AND v_start::time >= ds.start_time
                   AND v_end <= ds.work_date + ds.end_time) THEN
    RAISE EXCEPTION 'Khung % ngày % nằm ngoài ca trực của bác sĩ %',
      to_char(v_start, 'HH24:MI'), to_char(v_start, 'DD/MM/YYYY'),
      (SELECT full_name FROM staff WHERE id = NEW.doctor_id)
      USING ERRCODE = 'check_violation', HINT = 'LH-07: lịch chỉ được xếp vào ca bác sĩ trực';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION trg_stock_movements_apply() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_new  numeric;
  v_min  numeric;
  v_name text;
  v_unit text;
BEGIN
  UPDATE items SET current_stock = current_stock + NEW.quantity
  WHERE id = NEW.item_id
  RETURNING current_stock, min_stock, name, unit INTO v_new, v_min, v_name, v_unit;

  IF v_new < v_min AND v_new - NEW.quantity >= v_min THEN
    INSERT INTO notifications (recipient_role_id, notification_type, title, content, ref_table, ref_id)
    SELECT r.id, 'LOW_STOCK', 'Dưới ngưỡng tồn kho: ' || v_name,
           format('Tồn kho còn %s %s, ngưỡng tối thiểu %s %s', fmt_qty(v_new), v_unit, fmt_qty(v_min), v_unit),
           'items', NEW.item_id
    FROM roles r WHERE r.code = 'MANAGER';
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION apply_invoice_discount(p_invoice_id bigint, p_discount numeric,
                                       p_reason text, p_staff_id bigint)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_status       varchar;
  v_paid         numeric;
  v_old_total    numeric;
  v_old_discount numeric;
  v_gross        numeric;
BEGIN
  SELECT status, paid_amount, total_amount, discount_amount
  INTO v_status, v_paid, v_old_total, v_old_discount
  FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy hóa đơn %', p_invoice_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status = 'VOIDED' THEN
    RAISE EXCEPTION 'Hóa đơn đã hủy' USING ERRCODE = 'check_violation';
  END IF;
  IF p_discount > 0 AND coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Phải ghi lý do giảm giá' USING ERRCODE = 'check_violation';
  END IF;
  -- Hóa đơn đã thu tiền: đổi giảm giá là điều chỉnh hóa đơn (TT-08) — chỉ Quản lý, có lý do, có lịch sử
  IF v_paid > 0 THEN
    IF NOT EXISTS (SELECT 1 FROM staff s JOIN roles r ON r.id = s.role_id
                   WHERE s.id = p_staff_id AND r.code = 'MANAGER' AND s.is_active) THEN
      RAISE EXCEPTION 'Hóa đơn đã thu tiền — chỉ Quản lý được điều chỉnh giảm giá (TT-08)'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF coalesce(btrim(p_reason), '') = '' THEN
      RAISE EXCEPTION 'Phải ghi lý do điều chỉnh hóa đơn' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT coalesce(sum(quantity * unit_price), 0) INTO v_gross FROM invoice_items WHERE invoice_id = p_invoice_id;
  IF p_discount < 0 OR p_discount > v_gross THEN
    RAISE EXCEPTION 'Số tiền giảm % không hợp lệ (tổng trước giảm %)', p_discount, v_gross USING ERRCODE = 'check_violation';
  END IF;

  -- Ghi lý do trước khi phân bổ để thỏa chk_invoices_discount_reason
  IF p_discount > 0 THEN
    UPDATE invoices SET discount_reason = p_reason, discount_by = p_staff_id WHERE id = p_invoice_id;
  END IF;

  -- Làm tròn đến đồng; phần dư dồn vào dòng có giá trị lớn nhất
  WITH lines AS (
    SELECT id, quantity * unit_price AS gross,
           row_number() OVER (ORDER BY quantity * unit_price DESC, id) AS rn
    FROM invoice_items WHERE invoice_id = p_invoice_id
  ), alloc AS (
    SELECT id, rn, CASE WHEN v_gross = 0 THEN 0 ELSE round(p_discount * gross / v_gross, 0) END AS share
    FROM lines
  )
  UPDATE invoice_items ii
  SET discount_amount = CASE WHEN a.rn = 1
                             THEN p_discount - (SELECT coalesce(sum(share), 0) FROM alloc WHERE rn > 1)
                             ELSE a.share END
  FROM alloc a
  WHERE ii.id = a.id;

  IF p_discount = 0 THEN
    UPDATE invoices SET discount_reason = NULL, discount_by = NULL WHERE id = p_invoice_id;
  END IF;

  IF v_paid > 0 THEN
    INSERT INTO invoice_adjustments (invoice_id, adjustment_type, reason, old_total, new_total, detail, performed_by)
    SELECT p_invoice_id, 'ADJUST', p_reason, v_old_total, total_amount,
           jsonb_build_object('old_discount', v_old_discount, 'new_discount', p_discount), p_staff_id
    FROM invoices WHERE id = p_invoice_id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION trg_payments_validate() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_inv      invoices%ROWTYPE;
  v_previous numeric := 0;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.cash_closing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Lần thu % thuộc ca đã chốt két — không được sửa/xóa', OLD.receipt_code
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  NEW.work_date := coalesce(NEW.work_date, clinic_local(NEW.paid_at)::date);
  NEW.shift := coalesce(NEW.shift, CASE WHEN clinic_local(NEW.paid_at)::time < time '14:00'
                                        THEN 'MORNING' ELSE 'AFTERNOON' END);

  IF NEW.cash_closing_id IS NULL THEN
    PERFORM lock_cash_shift(NEW.received_by, NEW.work_date, NEW.shift);
    IF EXISTS (SELECT 1 FROM cash_closings
               WHERE receptionist_id = NEW.received_by AND work_date = NEW.work_date AND shift = NEW.shift) THEN
      RAISE EXCEPTION 'Ca % ngày % đã chốt két — không thể thêm/sửa lần thu',
        CASE NEW.shift WHEN 'MORNING' THEN 'sáng' ELSE 'chiều' END, to_char(NEW.work_date, 'DD/MM/YYYY')
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  SELECT * INTO v_inv FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF v_inv.status = 'VOIDED' THEN
    RAISE EXCEPTION 'Hóa đơn % đã hủy — không thể thu tiền', v_inv.invoice_code USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.invoice_id = NEW.invoice_id THEN
    v_previous := OLD.amount;
  END IF;
  IF NEW.amount > v_inv.balance_due + v_previous THEN
    RAISE EXCEPTION 'Số tiền thu % vượt quá số còn nợ % của hóa đơn %',
      NEW.amount, v_inv.balance_due + v_previous, v_inv.invoice_code USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION close_cash_drawer(p_receptionist_id bigint, p_work_date date, p_shift varchar,
                                  p_counted_cash numeric, p_note text DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  v_expected numeric;
  v_id       bigint;
BEGIN
  IF p_work_date > clinic_local(now())::date
     OR (p_work_date = clinic_local(now())::date AND p_shift = 'AFTERNOON'
         AND clinic_local(now())::time < time '14:00') THEN
    RAISE EXCEPTION 'Không thể chốt két cho ca chưa bắt đầu' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM lock_cash_shift(p_receptionist_id, p_work_date, p_shift);

  SELECT coalesce(sum(amount) FILTER (WHERE method = 'CASH'), 0) INTO v_expected
  FROM payments
  WHERE received_by = p_receptionist_id AND work_date = p_work_date AND shift = p_shift
    AND cash_closing_id IS NULL;

  INSERT INTO cash_closings (receptionist_id, work_date, shift, expected_cash, counted_cash, note)
  VALUES (p_receptionist_id, p_work_date, p_shift, v_expected, p_counted_cash, p_note)
  RETURNING id INTO v_id;

  UPDATE payments SET cash_closing_id = v_id
  WHERE received_by = p_receptionist_id AND work_date = p_work_date AND shift = p_shift
    AND cash_closing_id IS NULL;
  RETURN v_id;
END $$;

-- Viết lại số lượng trong các thông báo tồn kho đã sinh (3.00 → 3, 1.50 → 1,5)
UPDATE notifications
SET content = regexp_replace(regexp_replace(content, '(\d+)\.00(?!\d)', '\1', 'g'), '(\d+)\.(\d)0(?!\d)', '\1,\2', 'g')
WHERE notification_type = 'LOW_STOCK';
COMMIT;
