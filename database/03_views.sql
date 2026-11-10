-- =============================================================================
-- 03. View nghiệp vụ và báo cáo (BC-01 … BC-08)
-- Tháng/ngày tính theo giờ phòng khám (clinic_local).
-- =============================================================================
\set ON_ERROR_STOP on
BEGIN;

-- Quyền thực tế của từng vai trò, gồm quyền kế thừa (Quản lý ⊃ Lễ tân)
CREATE VIEW v_role_effective_permissions AS
WITH RECURSIVE role_tree AS (
  SELECT id AS role_id, id AS source_role_id FROM roles
  UNION
  SELECT rt.role_id, r.parent_role_id
  FROM role_tree rt
  JOIN roles r ON r.id = rt.source_role_id
  WHERE r.parent_role_id IS NOT NULL
)
SELECT DISTINCT rt.role_id, ro.code AS role_code, p.code AS permission_code, p.module, p.name AS permission_name
FROM role_tree rt
JOIN roles ro ON ro.id = rt.role_id
JOIN role_permissions rp ON rp.role_id = rt.source_role_id
JOIN permissions p ON p.id = rp.permission_id;

-- DT-01: hàng chờ khám hôm nay (mỗi nhóm lịch hiện 1 dòng)
CREATE VIEW v_waiting_queue AS
SELECT * FROM (
  SELECT DISTINCT ON (a.booking_group_id)
         a.id AS appointment_id, a.booking_group_id, a.checked_in_at, a.start_at,
         a.doctor_id, d.full_name AS doctor_name, a.chair_id, c.name AS chair_name,
         a.patient_id, p.patient_code, p.full_name AS patient_name, p.date_of_birth,
         a.service_id, s.name AS service_name, a.source
  FROM appointments a
  JOIN patients p ON p.id = a.patient_id
  JOIN staff d    ON d.id = a.doctor_id
  JOIN chairs c   ON c.id = a.chair_id
  LEFT JOIN services s ON s.id = a.service_id
  WHERE a.status = 'ARRIVED'
    AND clinic_local(a.start_at)::date = clinic_local(now())::date
  ORDER BY a.booking_group_id, a.start_at
) q
ORDER BY checked_in_at;

-- BC-01: doanh thu theo bác sĩ thực hiện (dòng dịch vụ sau giảm giá) + đã thu thực tế (phân bổ theo tỷ lệ)
CREATE VIEW rpt_doctor_revenue_monthly AS
SELECT date_trunc('month', clinic_local(i.issued_at))::date AS month,
       ii.performing_doctor_id AS doctor_id,
       d.full_name AS doctor_name,
       count(*) AS line_count,
       sum(ii.line_total) AS revenue,
       round(sum(CASE WHEN i.total_amount > 0 THEN ii.line_total * i.paid_amount / i.total_amount ELSE 0 END), 0) AS collected
FROM invoice_items ii
JOIN invoices i ON i.id = ii.invoice_id
JOIN staff d ON d.id = ii.performing_doctor_id
WHERE i.status <> 'VOIDED'
  AND ii.line_type IN ('SERVICE', 'TREATMENT_PLAN')
GROUP BY 1, 2, 3;

-- BC-02: công suất ghế theo khung giờ (booked / số ngày cùng thứ trong tháng)
CREATE VIEW rpt_chair_utilization AS
WITH booked AS (
  SELECT a.chair_id,
         date_trunc('month', clinic_local(a.start_at))::date AS month,
         extract(isodow FROM clinic_local(a.start_at))::int  AS iso_weekday,
         clinic_local(a.start_at)::time                      AS slot_time,
         count(*)                                            AS booked_slots
  FROM appointments a
  WHERE a.status <> 'CANCELLED'
  GROUP BY 1, 2, 3, 4
)
SELECT b.chair_id, c.name AS chair_name, b.month, b.iso_weekday, b.slot_time, b.booked_slots,
       cap.days AS available_slots,
       round(100.0 * b.booked_slots / cap.days, 1) AS utilization_pct
FROM booked b
JOIN chairs c ON c.id = b.chair_id
CROSS JOIN LATERAL (
  SELECT count(*) AS days
  FROM generate_series(b.month, (b.month + interval '1 month' - interval '1 day')::date, interval '1 day') g
  WHERE extract(isodow FROM g)::int = b.iso_weekday
) cap;

-- BC-03: bệnh nhân quá 6 tháng chưa quay lại và chưa có lịch sắp tới
CREATE VIEW rpt_inactive_patients AS
SELECT p.id AS patient_id, p.patient_code, p.full_name, p.date_of_birth, p.phone, p.last_visit_at,
       clinic_local(now())::date - clinic_local(p.last_visit_at)::date AS days_since_last_visit
FROM patients p
WHERE p.status = 'ACTIVE'
  AND p.last_visit_at < now() - interval '6 months'
  AND NOT EXISTS (SELECT 1 FROM appointments a
                  WHERE a.patient_id = p.id AND a.status = 'BOOKED' AND a.start_at > now());

-- BC-04: thống kê hủy lịch theo dịch vụ dự kiến và lý do
CREATE VIEW rpt_cancellation_stats AS
SELECT date_trunc('month', clinic_local(a.start_at))::date AS month,
       a.service_id,
       coalesce(s.name, '(Chưa chọn dịch vụ)') AS service_name,
       cr.code AS reason_code, cr.name AS reason_name, cr.is_no_show,
       count(DISTINCT a.booking_group_id) AS cancelled_count
FROM appointments a
JOIN cancel_reasons cr ON cr.id = a.cancel_reason_id
LEFT JOIN services s ON s.id = a.service_id
WHERE a.status = 'CANCELLED'
GROUP BY 1, 2, 3, 4, 5, 6;

-- BC-05: công nợ theo bệnh nhân
CREATE VIEW rpt_patient_debts AS
SELECT p.id AS patient_id, p.patient_code, p.full_name, p.phone,
       count(*) AS open_invoices,
       sum(i.balance_due) AS total_debt,
       min(i.issued_at) AS oldest_invoice_at
FROM invoices i
JOIN patients p ON p.id = i.patient_id
WHERE i.status IN ('UNPAID', 'PARTIALLY_PAID')
GROUP BY p.id, p.patient_code, p.full_name, p.phone;

-- BC-06: liệu trình đang dở, còn mấy buổi, còn bao nhiêu tiền
CREATE VIEW rpt_treatment_plans_in_progress AS
SELECT tp.id AS treatment_plan_id, tp.plan_code, tp.name, tp.plan_type,
       tp.patient_id, p.patient_code, p.full_name AS patient_name,
       tp.primary_doctor_id, d.full_name AS doctor_name,
       tp.expected_sessions,
       coalesce(s.done, 0) AS completed_sessions,
       greatest(tp.expected_sessions - coalesce(s.done, 0), 0) AS remaining_sessions,
       s.last_session_at,
       tp.total_price,
       coalesce(pay.paid, 0) AS paid_amount,
       tp.total_price - coalesce(pay.paid, 0) AS remaining_amount,
       tp.started_on
FROM treatment_plans tp
JOIN patients p ON p.id = tp.patient_id
JOIN staff d ON d.id = tp.primary_doctor_id
LEFT JOIN LATERAL (
  SELECT count(*) AS done, max(tr.visit_at) AS last_session_at
  FROM treatment_records tr
  WHERE tr.treatment_plan_id = tp.id AND tr.status <> 'CANCELLED'
) s ON true
LEFT JOIN LATERAL (
  SELECT sum(i.paid_amount) AS paid
  FROM invoices i
  WHERE i.treatment_plan_id = tp.id AND i.status <> 'VOIDED'
) pay ON true
WHERE tp.status = 'ACTIVE';

-- BC-07: vật tư / thuốc sắp hết (tồn ≤ ngưỡng tối thiểu)
CREATE VIEW rpt_low_stock_items AS
SELECT i.id AS item_id, i.code, i.name, i.item_type, i.unit,
       i.current_stock, i.min_stock,
       i.min_stock - i.current_stock AS shortage
FROM items i
WHERE i.is_active AND i.current_stock <= i.min_stock;

-- BC-08: doanh thu theo tháng, so với tháng trước
CREATE VIEW rpt_monthly_revenue AS
WITH inv AS (
  SELECT date_trunc('month', clinic_local(issued_at))::date AS month,
         sum(total_amount) AS revenue, count(*) AS invoice_count
  FROM invoices WHERE status <> 'VOIDED'
  GROUP BY 1
), pay AS (
  SELECT date_trunc('month', clinic_local(p.paid_at))::date AS month, sum(p.amount) AS collected
  FROM payments p JOIN invoices i ON i.id = p.invoice_id
  WHERE i.status <> 'VOIDED'
  GROUP BY 1
), months AS (
  SELECT generate_series(min(month), max(month), interval '1 month')::date AS month
  FROM (SELECT month FROM inv UNION SELECT month FROM pay) m
), merged AS (
  SELECT m.month,
         coalesce(inv.revenue, 0)       AS revenue,
         coalesce(inv.invoice_count, 0) AS invoice_count,
         coalesce(pay.collected, 0)     AS collected
  FROM months m
  LEFT JOIN inv ON inv.month = m.month
  LEFT JOIN pay ON pay.month = m.month
)
SELECT month, revenue, invoice_count, collected,
       lag(revenue) OVER (ORDER BY month) AS previous_revenue,
       round(100.0 * (revenue - lag(revenue) OVER (ORDER BY month))
             / nullif(lag(revenue) OVER (ORDER BY month), 0), 2) AS revenue_change_pct
FROM merged;

COMMIT;
