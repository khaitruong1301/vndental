// Báo cáo: BC-01 … BC-08 (dựa trên các view rpt_* trong database/03_views.sql)
import { Router } from 'express';
import { z } from 'zod';
import { requirePerm } from '../auth';
import { query, queryOne } from '../db';

const router = Router();

const monthQuery = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Tháng phải có dạng YYYY-MM')
    .optional(),
});

// Ngày đầu tháng được chọn (mặc định tháng hiện tại theo giờ phòng khám)
const MONTH_START = `coalesce(to_date($1, 'YYYY-MM'), date_trunc('month', clinic_local(now()))::date)`;

// BC-01: doanh thu theo bác sĩ thực hiện + đã thu, so với tháng trước
router.get('/doctor-revenue', requirePerm('BC-01'), async (req, res) => {
  const { month } = monthQuery.parse(req.query);
  const rows = await query(
    `WITH m AS (SELECT ${MONTH_START} AS start)
     SELECT d.id AS doctor_id, d.staff_code, d.full_name AS doctor_name,
            coalesce(cur.line_count, 0) AS line_count,
            coalesce(cur.revenue, 0) AS revenue,
            coalesce(cur.collected, 0) AS collected,
            coalesce(prev.revenue, 0) AS previous_revenue
     FROM m
     CROSS JOIN staff d
     JOIN roles r ON r.id = d.role_id AND r.code = 'DOCTOR'
     LEFT JOIN rpt_doctor_revenue_monthly cur ON cur.doctor_id = d.id AND cur.month = m.start
     LEFT JOIN rpt_doctor_revenue_monthly prev
            ON prev.doctor_id = d.id AND prev.month = (m.start - interval '1 month')::date
     WHERE d.is_active OR cur.revenue IS NOT NULL
     ORDER BY revenue DESC, d.staff_code`,
    [month ?? null],
  );
  const period = await queryOne<{ month: string; previous_month: string }>(
    `SELECT to_char(${MONTH_START}, 'YYYY-MM') AS month,
            to_char(${MONTH_START} - interval '1 month', 'YYYY-MM') AS previous_month`,
    [month ?? null],
  );
  const sum = (key: 'revenue' | 'collected' | 'previous_revenue') =>
    rows.reduce((s, r) => s + Number(r[key]), 0);
  res.json({
    ...period,
    totals: { revenue: sum('revenue'), collected: sum('collected'), previous_revenue: sum('previous_revenue') },
    rows,
  });
});

// BC-02: công suất ghế theo thứ × khung giờ (giờ mở cửa: 8h–20h; Chủ nhật 14h–17h)
router.get('/chair-utilization', requirePerm('BC-02'), async (req, res) => {
  const { month } = monthQuery.parse(req.query);
  const cells = await query<{
    chair_id: number;
    chair_name: string;
    iso_weekday: number;
    slot_time: string;
    available_slots: number;
    booked_slots: number;
  }>(
    `WITH m AS (SELECT ${MONTH_START} AS start),
     days AS (
       SELECT extract(isodow FROM g)::int AS dow
       FROM m, generate_series(m.start, (m.start + interval '1 month' - interval '1 day')::date, interval '1 day') g
     ),
     slots AS (SELECT (time '08:00' + n * interval '30 minutes')::time AS t FROM generate_series(0, 23) n),
     open_cells AS (
       SELECT dow, t, count(*) AS days
       FROM days CROSS JOIN slots
       WHERE dow <> 7 OR (t >= time '14:00' AND t < time '17:00')
       GROUP BY dow, t
     ),
     booked AS (
       SELECT u.chair_id, u.iso_weekday, u.slot_time, u.booked_slots
       FROM rpt_chair_utilization u, m WHERE u.month = m.start
     )
     SELECT c.id AS chair_id, c.name AS chair_name, o.dow AS iso_weekday, to_char(o.t, 'HH24:MI') AS slot_time,
            o.days AS available_slots, coalesce(b.booked_slots, 0) AS booked_slots
     FROM chairs c
     CROSS JOIN open_cells o
     LEFT JOIN booked b ON b.chair_id = c.id AND b.iso_weekday = o.dow AND b.slot_time = o.t
     WHERE c.is_active
     ORDER BY c.code, o.dow, o.t`,
    [month ?? null],
  );

  const pct = (booked: number, available: number) =>
    available > 0 ? Math.round((1000 * booked) / available) / 10 : 0;

  const chairMap = new Map<number, { chair_id: number; chair_name: string; booked: number; available: number }>();
  const slotMap = new Map<string, { slot_time: string; booked: number; available: number }>();
  for (const c of cells) {
    const chair = chairMap.get(c.chair_id) ?? { chair_id: c.chair_id, chair_name: c.chair_name, booked: 0, available: 0 };
    chair.booked += c.booked_slots;
    chair.available += c.available_slots;
    chairMap.set(c.chair_id, chair);
    const slot = slotMap.get(c.slot_time) ?? { slot_time: c.slot_time, booked: 0, available: 0 };
    slot.booked += c.booked_slots;
    slot.available += c.available_slots;
    slotMap.set(c.slot_time, slot);
  }
  const chairs = [...chairMap.values()].map((c) => ({ ...c, utilization_pct: pct(c.booked, c.available) }));
  const slotsAll = [...slotMap.values()].map((s) => ({ ...s, utilization_pct: pct(s.booked, s.available) }));
  const emptiest_slots = [...slotsAll]
    .sort((a, b) => a.utilization_pct - b.utilization_pct || a.slot_time.localeCompare(b.slot_time))
    .slice(0, 5);
  const totalBooked = chairs.reduce((s, c) => s + c.booked, 0);
  const totalAvailable = chairs.reduce((s, c) => s + c.available, 0);
  const period = await queryOne<{ month: string }>(`SELECT to_char(${MONTH_START}, 'YYYY-MM') AS month`, [
    month ?? null,
  ]);

  res.json({
    month: period?.month,
    totals: { booked: totalBooked, available: totalAvailable, utilization_pct: pct(totalBooked, totalAvailable) },
    chairs,
    emptiest_slots,
    cells: cells.map((c) => ({ ...c, utilization_pct: pct(c.booked_slots, c.available_slots) })),
  });
});

// BC-03: bệnh nhân quá N tháng chưa quay lại, chưa có lịch sắp tới
router.get('/inactive-patients', requirePerm('BC-03'), async (req, res) => {
  const { months } = z.object({ months: z.coerce.number().int().min(1).max(60).default(6) }).parse(req.query);
  const rows = await query(
    `SELECT p.id AS patient_id, p.patient_code, p.full_name, p.date_of_birth, p.phone, p.is_legacy,
            p.last_visit_at,
            clinic_local(now())::date - clinic_local(p.last_visit_at)::date AS days_since_last_visit,
            g.full_name AS guardian_name, g.relationship AS guardian_relationship, g.phone AS guardian_phone
     FROM patients p
     LEFT JOIN LATERAL (
       SELECT full_name, relationship, phone FROM patient_guardians
       WHERE patient_id = p.id ORDER BY is_primary DESC, id LIMIT 1
     ) g ON true
     WHERE p.status = 'ACTIVE'
       AND p.last_visit_at < now() - make_interval(months => $1)
       AND NOT EXISTS (SELECT 1 FROM appointments a
                       WHERE a.patient_id = p.id AND a.status = 'BOOKED' AND a.start_at > now())
     ORDER BY p.last_visit_at`,
    [months],
  );
  res.json({ months, rows });
});

// BC-04: thống kê hủy lịch theo lý do và dịch vụ dự kiến
router.get('/cancellations', requirePerm('BC-04'), async (req, res) => {
  const { month } = monthQuery.parse(req.query);
  const params = [month ?? null];
  const [rows, totals] = await Promise.all([
    query<{
      service_id: number | null;
      service_name: string;
      reason_code: string;
      reason_name: string;
      is_no_show: boolean;
      cancelled_count: number;
    }>(
      `SELECT service_id, service_name, reason_code, reason_name, is_no_show, cancelled_count
       FROM rpt_cancellation_stats WHERE month = ${MONTH_START}
       ORDER BY cancelled_count DESC, reason_name`,
      params,
    ),
    queryOne<{ bookings: number; cancelled: number; no_show: number }>(
      `SELECT count(DISTINCT a.booking_group_id) AS bookings,
              count(DISTINCT a.booking_group_id) FILTER (WHERE a.status = 'CANCELLED') AS cancelled,
              count(DISTINCT a.booking_group_id) FILTER (WHERE a.status = 'CANCELLED' AND cr.is_no_show) AS no_show
       FROM appointments a
       LEFT JOIN cancel_reasons cr ON cr.id = a.cancel_reason_id
       WHERE date_trunc('month', clinic_local(a.start_at))::date = ${MONTH_START}`,
      params,
    ),
  ]);

  const group = <K extends string>(key: (r: (typeof rows)[number]) => K, extra: (r: (typeof rows)[number]) => object) => {
    const map = new Map<K, { count: number } & Record<string, unknown>>();
    for (const r of rows) {
      const k = key(r);
      const cur = map.get(k) ?? { ...extra(r), count: 0 };
      cur.count += r.cancelled_count;
      map.set(k, cur);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  };

  res.json({
    totals: totals ?? { bookings: 0, cancelled: 0, no_show: 0 },
    by_reason: group(
      (r) => r.reason_code,
      (r) => ({ reason_code: r.reason_code, reason_name: r.reason_name, is_no_show: r.is_no_show }),
    ),
    by_service: group(
      (r) => String(r.service_id ?? 'none'),
      (r) => ({ service_id: r.service_id, service_name: r.service_name }),
    ),
    rows,
  });
});

// BC-05: công nợ theo bệnh nhân
router.get('/debts', requirePerm('BC-05'), async (_req, res) => {
  const rows = await query<{ total_debt: number; open_invoices: number }>(
    'SELECT * FROM rpt_patient_debts ORDER BY total_debt DESC',
  );
  res.json({
    totals: {
      total_debt: rows.reduce((s, r) => s + Number(r.total_debt), 0),
      patients: rows.length,
      open_invoices: rows.reduce((s, r) => s + Number(r.open_invoices), 0),
    },
    rows,
  });
});

// BC-06: liệu trình đang dở
router.get('/plans-in-progress', requirePerm('BC-06'), async (_req, res) => {
  const rows = await query('SELECT * FROM rpt_treatment_plans_in_progress ORDER BY started_on, plan_code');
  res.json({ rows });
});

// BC-07: vật tư / thuốc sắp hết
router.get('/low-stock', requirePerm('BC-07'), async (_req, res) => {
  const rows = await query(
    `SELECT l.*, l.current_stock < l.min_stock AS below_min,
            (SELECT max(created_at) FROM stock_movements sm
             WHERE sm.item_id = l.item_id AND sm.movement_type = 'IMPORT') AS last_import_at
     FROM rpt_low_stock_items l
     ORDER BY l.shortage DESC, l.name`,
  );
  res.json({ rows });
});

// BC-08: doanh thu N tháng gần nhất, % so với tháng trước
router.get('/monthly-revenue', requirePerm('BC-08'), async (req, res) => {
  const { months } = z.object({ months: z.coerce.number().int().min(2).max(36).default(12) }).parse(req.query);
  const rows = await query(
    `WITH months AS (
       SELECT (date_trunc('month', clinic_local(now())) - make_interval(months => g))::date AS month
       FROM generate_series(0, $1) g
     ), inv AS (
       SELECT date_trunc('month', clinic_local(issued_at))::date AS month,
              sum(total_amount) AS revenue, count(*) AS invoice_count
       FROM invoices WHERE status <> 'VOIDED' GROUP BY 1
     ), pay AS (
       SELECT date_trunc('month', clinic_local(p.paid_at))::date AS month, sum(p.amount) AS collected
       FROM payments p JOIN invoices i ON i.id = p.invoice_id
       WHERE i.status <> 'VOIDED' GROUP BY 1
     ), merged AS (
       SELECT m.month,
              coalesce(inv.revenue, 0) AS revenue,
              coalesce(inv.invoice_count, 0) AS invoice_count,
              coalesce(pay.collected, 0) AS collected
       FROM months m
       LEFT JOIN inv ON inv.month = m.month
       LEFT JOIN pay ON pay.month = m.month
     ), calc AS (
       SELECT to_char(month, 'YYYY-MM') AS month, revenue, invoice_count, collected,
              lag(revenue) OVER (ORDER BY month) AS previous_revenue,
              row_number() OVER (ORDER BY month) AS rn
       FROM merged
     )
     SELECT month, revenue, invoice_count, collected, previous_revenue,
            CASE WHEN previous_revenue > 0
                 THEN round(100.0 * (revenue - previous_revenue) / previous_revenue, 1) END AS revenue_change_pct
     FROM calc WHERE rn > 1
     ORDER BY month`,
    [months],
  );
  res.json({ months, rows });
});

export default router;
