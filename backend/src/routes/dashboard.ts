// Trang tổng quan: số liệu trong ngày + lịch hôm nay
import { Router } from 'express';
import { currentUser, hasPerm } from '../auth';
import { query, queryOne } from '../db';

const router = Router();

router.get('/', async (req, res) => {
  const user = currentUser(req);
  const doctorId = user.role === 'DOCTOR' ? user.id : null;

  const stats = await queryOne(
    `SELECT
       (SELECT count(DISTINCT booking_group_id) FROM appointments
        WHERE clinic_local(start_at)::date = clinic_local(now())::date AND status <> 'CANCELLED'
          AND ($1::bigint IS NULL OR doctor_id = $1)) AS appointments_today,
       (SELECT count(*) FROM v_waiting_queue WHERE $1::bigint IS NULL OR doctor_id = $1) AS waiting,
       (SELECT count(*) FROM treatment_records WHERE status = 'PENDING_PAYMENT') AS pending_payment,
       (SELECT coalesce(sum(balance_due), 0) FROM invoices WHERE status IN ('UNPAID', 'PARTIALLY_PAID')) AS open_debt,
       (SELECT coalesce(sum(amount), 0) FROM payments
        WHERE clinic_local(paid_at)::date = clinic_local(now())::date) AS collected_today,
       (SELECT count(*) FROM rpt_low_stock_items) AS low_stock`,
    [doctorId],
  );
  // Chỉ trả số liệu thuộc quyền của người xem (bác sĩ không xem tài chính / kho)
  if (stats) {
    if (!hasPerm(req, 'TT-01')) stats.pending_payment = null;
    if (!hasPerm(req, 'TT-04') && !hasPerm(req, 'TT-06')) {
      stats.open_debt = null;
      stats.collected_today = null;
    }
    if (!hasPerm(req, 'QT-04') && !hasPerm(req, 'BC-07')) stats.low_stock = null;
  }

  const schedule = await query(
    `SELECT a.booking_group_id, min(a.id) AS appointment_id,
            min(a.start_at) AS start_at, max(a.end_at) AS end_at,
            a.status, a.source, a.patient_id, p.patient_code, p.full_name AS patient_name,
            a.doctor_id, d.full_name AS doctor_name, a.chair_id, c.name AS chair_name,
            s.name AS service_name
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     JOIN staff d ON d.id = a.doctor_id
     JOIN chairs c ON c.id = a.chair_id
     LEFT JOIN services s ON s.id = a.service_id
     WHERE clinic_local(a.start_at)::date = clinic_local(now())::date
       AND ($1::bigint IS NULL OR a.doctor_id = $1)
     GROUP BY a.booking_group_id, a.status, a.source, a.patient_id, p.patient_code, p.full_name,
              a.doctor_id, d.full_name, a.chair_id, c.name, s.name
     ORDER BY min(a.start_at)`,
    [doctorId],
  );

  res.json({ stats, schedule });
});

export default router;
