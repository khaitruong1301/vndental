// Thanh toán: TT-01 … TT-08 (lập hóa đơn, giảm giá, thu tiền, công nợ, chốt két, hủy hóa đơn)
import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requirePerm } from '../auth.js';
import { query, queryOne, withTx } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { dateStr, idParam, optionalText, shift } from '../validate.js';

const router = Router();

const PAGE_SIZE = 50;
const CURRENT_SHIFT_SQL = `CASE WHEN clinic_local(now())::time < time '14:00' THEN 'MORNING' ELSE 'AFTERNOON' END`;

/* ------------------------------ TT-01: phiếu chờ thanh toán ------------------------------ */

router.get('/pending-records', requirePerm('TT-01'), async (_req, res) => {
  const rows = await query(
    `SELECT tr.id, tr.record_code, tr.visit_at, tr.patient_id, p.patient_code, p.full_name AS patient_name, p.phone,
            tr.primary_doctor_id, d.full_name AS doctor_name, tr.treatment_plan_id, tp.plan_code, tr.plan_session_no,
            svc.summary AS services_summary, svc.total AS service_total, svc.missing_price AS service_missing_price,
            med.count AS medicine_count, med.total AS medicine_total, med.missing_price AS medicine_missing_price,
            coalesce(svc.total, 0) + coalesce(med.total, 0) AS estimated_total
     FROM treatment_records tr
     JOIN patients p ON p.id = tr.patient_id
     JOIN staff d ON d.id = tr.primary_doctor_id
     LEFT JOIN treatment_plans tp ON tp.id = tr.treatment_plan_id
     LEFT JOIN LATERAL (
       SELECT string_agg(s.name || CASE WHEN tri.tooth_code IN ('FULL', 'UPPER', 'LOWER') THEN ''
                                        ELSE ' (R' || tri.tooth_code || ')' END, ', ' ORDER BY tri.line_no) AS summary,
              sum(CASE WHEN tri.is_plan_package THEN 0 ELSE tri.quantity * coalesce(cp.price, 0) END) AS total,
              bool_or(NOT tri.is_plan_package AND cp.price IS NULL) AS missing_price
       FROM treatment_record_items tri
       JOIN services s ON s.id = tri.service_id
       LEFT JOIN LATERAL (
         SELECT sp.price FROM service_prices sp
         WHERE sp.service_id = tri.service_id AND sp.effective_from <= clinic_local(now())::date
         ORDER BY sp.effective_from DESC LIMIT 1
       ) cp ON true
       WHERE tri.treatment_record_id = tr.id
     ) svc ON true
     LEFT JOIN LATERAL (
       SELECT count(*) AS count,
              sum(pi.quantity * coalesce(ip.price, 0)) AS total,
              bool_or(ip.price IS NULL) AS missing_price
       FROM prescription_items pi
       LEFT JOIN LATERAL (
         SELECT ip.price FROM item_prices ip
         WHERE ip.item_id = pi.item_id AND ip.effective_from <= clinic_local(now())::date
         ORDER BY ip.effective_from DESC LIMIT 1
       ) ip ON true
       WHERE pi.treatment_record_id = tr.id AND NOT pi.is_external
     ) med ON true
     WHERE tr.status = 'PENDING_PAYMENT'
     ORDER BY tr.visit_at`,
  );
  res.json(rows);
});

/* ------------------------------ TT-01 + TT-02: lập hóa đơn ------------------------------ */

router.post('/invoices', requirePerm('TT-01'), async (req, res) => {
  const user = currentUser(req);
  const body = z
    .object({
      treatment_record_id: z.coerce.number().int().positive().optional(),
      treatment_plan_id: z.coerce.number().int().positive().optional(),
    })
    .refine((b) => !!b.treatment_record_id !== !!b.treatment_plan_id, {
      message: 'Chọn đúng một: phiếu điều trị hoặc liệu trình',
    })
    .parse(req.body);

  const id = await withTx(user.id, async (db) => {
    const row = body.treatment_record_id
      ? await queryOne<{ id: number }>(
          'SELECT create_invoice_from_treatment_record($1, $2) AS id',
          [body.treatment_record_id, user.id],
          db,
        )
      : await queryOne<{ id: number }>(
          'SELECT create_invoice_for_treatment_plan($1, $2) AS id',
          [body.treatment_plan_id, user.id],
          db,
        );
    return row!.id;
  });
  res.status(201).json({ id });
});

/* ------------------------------ Danh sách / chi tiết hóa đơn ------------------------------ */

router.get('/invoices', requirePerm('TT-01', 'TT-04', 'TT-06'), async (req, res) => {
  const f = z
    .object({
      status: z.enum(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'VOIDED', 'OPEN']).optional(),
      q: z.string().trim().optional(),
      date_from: dateStr.optional(),
      date_to: dateStr.optional(),
      patient_id: z.coerce.number().int().positive().optional(),
      page: z.coerce.number().int().positive().default(1),
    })
    .parse(req.query);

  const where = `
    WHERE ($1::text IS NULL
           OR ($1 = 'OPEN' AND i.status IN ('UNPAID', 'PARTIALLY_PAID'))
           OR i.status = $1)
      AND ($2::text IS NULL OR i.invoice_code ILIKE '%' || $2 || '%' OR p.patient_code ILIKE '%' || $2 || '%'
           OR lower(p.full_name) LIKE '%' || lower($2) || '%' OR p.phone LIKE $2 || '%')
      AND ($3::date IS NULL OR clinic_local(i.issued_at)::date >= $3)
      AND ($4::date IS NULL OR clinic_local(i.issued_at)::date <= $4)
      AND ($5::bigint IS NULL OR i.patient_id = $5)`;
  const params = [f.status ?? null, f.q || null, f.date_from ?? null, f.date_to ?? null, f.patient_id ?? null];

  const [rows, totals] = await Promise.all([
    query(
      `SELECT i.id, i.invoice_code, i.invoice_type, i.status, i.issued_at, i.subtotal, i.discount_amount,
              i.total_amount, i.paid_amount, i.balance_due, i.patient_id, p.patient_code, p.full_name AS patient_name,
              p.phone, s.full_name AS issued_by_name, tr.record_code, tp.plan_code
       FROM invoices i
       JOIN patients p ON p.id = i.patient_id
       JOIN staff s ON s.id = i.issued_by
       LEFT JOIN treatment_records tr ON tr.id = i.treatment_record_id
       LEFT JOIN treatment_plans tp ON tp.id = i.treatment_plan_id
       ${where}
       ORDER BY i.issued_at DESC, i.id DESC
       LIMIT ${PAGE_SIZE} OFFSET $6`,
      [...params, (f.page - 1) * PAGE_SIZE],
    ),
    queryOne<{ total: number; sum_total: number; sum_balance: number }>(
      `SELECT count(*) AS total,
              coalesce(sum(i.total_amount) FILTER (WHERE i.status <> 'VOIDED'), 0) AS sum_total,
              coalesce(sum(i.balance_due) FILTER (WHERE i.status <> 'VOIDED'), 0) AS sum_balance
       FROM invoices i JOIN patients p ON p.id = i.patient_id ${where}`,
      params,
    ),
  ]);
  res.json({ rows, page: f.page, page_size: PAGE_SIZE, ...totals });
});

router.get('/invoices/:id', requirePerm('TT-01', 'TT-04', 'TT-05', 'TT-06'), async (req, res) => {
  const id = idParam(String(req.params.id));
  const invoice = await queryOne(
    `SELECT i.*, p.patient_code, p.full_name AS patient_name, p.phone AS patient_phone,
            p.date_of_birth AS patient_dob, p.address AS patient_address,
            ib.full_name AS issued_by_name, vb.full_name AS voided_by_name, db.full_name AS discount_by_name,
            tr.record_code, tr.visit_at, rd.full_name AS record_doctor_name,
            tp.plan_code, tp.name AS plan_name
     FROM invoices i
     JOIN patients p ON p.id = i.patient_id
     JOIN staff ib ON ib.id = i.issued_by
     LEFT JOIN staff vb ON vb.id = i.voided_by
     LEFT JOIN staff db ON db.id = i.discount_by
     LEFT JOIN treatment_records tr ON tr.id = i.treatment_record_id
     LEFT JOIN staff rd ON rd.id = tr.primary_doctor_id
     LEFT JOIN treatment_plans tp ON tp.id = i.treatment_plan_id
     WHERE i.id = $1`,
    [id],
  );
  if (!invoice) throw notFound('Không tìm thấy hóa đơn');

  const [lines, payments, adjustments, installments] = await Promise.all([
    query(
      `SELECT ii.id, ii.line_no, ii.line_type, ii.description, ii.tooth_code, ii.quantity, ii.unit_price,
              ii.discount_amount, ii.line_total, ii.performing_doctor_id, d.full_name AS performing_doctor_name,
              ii.service_id, ii.item_id
       FROM invoice_items ii LEFT JOIN staff d ON d.id = ii.performing_doctor_id
       WHERE ii.invoice_id = $1 ORDER BY ii.line_no`,
      [id],
    ),
    query(
      `SELECT pm.id, pm.receipt_code, pm.amount, pm.method, pm.transaction_ref, pm.paid_at, pm.work_date, pm.shift,
              pm.note, pm.received_by, s.full_name AS received_by_name, pm.cash_closing_id IS NOT NULL AS is_closed,
              pm.installment_id, tpi.installment_no
       FROM payments pm
       JOIN staff s ON s.id = pm.received_by
       LEFT JOIN treatment_plan_installments tpi ON tpi.id = pm.installment_id
       WHERE pm.invoice_id = $1 ORDER BY pm.paid_at, pm.id`,
      [id],
    ),
    query(
      `SELECT a.id, a.adjustment_type, a.reason, a.old_total, a.new_total, a.detail, a.performed_at,
              s.full_name AS performed_by_name
       FROM invoice_adjustments a JOIN staff s ON s.id = a.performed_by
       WHERE a.invoice_id = $1 ORDER BY a.performed_at`,
      [id],
    ),
    invoice.treatment_plan_id
      ? query(
          `SELECT tpi.id, tpi.installment_no, tpi.due_date, tpi.amount, tpi.note,
                  coalesce((SELECT sum(pm.amount) FROM payments pm
                            WHERE pm.installment_id = tpi.id AND pm.invoice_id = $2), 0) AS paid_amount
           FROM treatment_plan_installments tpi
           WHERE tpi.treatment_plan_id = $1 ORDER BY tpi.installment_no`,
          [invoice.treatment_plan_id, id],
        )
      : Promise.resolve([]),
  ]);

  res.json({ ...invoice, lines, payments, adjustments, installments });
});

/* ------------------------------ TT-03: giảm giá ------------------------------ */

router.post('/invoices/:id/discount', requirePerm('TT-03'), async (req, res) => {
  const user = currentUser(req);
  const id = idParam(String(req.params.id));
  const { amount, reason } = z
    .object({ amount: z.coerce.number().int('Số tiền phải là số nguyên đồng').min(0, 'Số tiền giảm không được âm'), reason: optionalText })
    .parse(req.body);
  if (amount > 0 && !reason) throw badRequest('Phải ghi lý do giảm giá');

  await withTx(user.id, (db) =>
    db.query('SELECT apply_invoice_discount($1, $2, $3, $4)', [id, amount, reason ?? null, user.id]),
  );
  res.json({ ok: true });
});

/* ------------------------------ TT-04: thu tiền ------------------------------ */

router.post('/invoices/:id/payments', requirePerm('TT-04'), async (req, res) => {
  const user = currentUser(req);
  const id = idParam(String(req.params.id));
  const body = z
    .object({
      amount: z.coerce.number().int('Số tiền phải là số nguyên đồng').positive('Số tiền thu phải lớn hơn 0'),
      method: z.enum(['CASH', 'BANK_TRANSFER']),
      transaction_ref: optionalText,
      installment_id: z.coerce.number().int().positive().nullish(),
      note: optionalText,
    })
    .parse(req.body);

  const payment = await withTx(user.id, async (db) => {
    const invoice = await queryOne<{ treatment_plan_id: number | null }>(
      'SELECT treatment_plan_id FROM invoices WHERE id = $1',
      [id],
      db,
    );
    if (!invoice) throw notFound('Không tìm thấy hóa đơn');
    if (body.installment_id) {
      const ok = await queryOne(
        'SELECT 1 FROM treatment_plan_installments WHERE id = $1 AND treatment_plan_id = $2',
        [body.installment_id, invoice.treatment_plan_id],
        db,
      );
      if (!ok) throw badRequest('Đợt thanh toán không thuộc liệu trình của hóa đơn này');
    }
    return queryOne<{ id: number; receipt_code: string }>(
      `INSERT INTO payments (invoice_id, installment_id, amount, method, transaction_ref, received_by, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, receipt_code`,
      [
        id,
        body.installment_id ?? null,
        body.amount,
        body.method,
        body.method === 'BANK_TRANSFER' ? (body.transaction_ref ?? null) : null,
        user.id,
        body.note ?? null,
      ],
      db,
    );
  });
  res.status(201).json(payment);
});

/* ------------------------------ TT-08: hủy hóa đơn ------------------------------ */

router.post('/invoices/:id/void', requirePerm('TT-08'), async (req, res) => {
  const user = currentUser(req);
  const id = idParam(String(req.params.id));
  const { reason } = z.object({ reason: z.string().trim().min(1, 'Phải ghi lý do hủy hóa đơn') }).parse(req.body);
  await withTx(user.id, (db) => db.query('SELECT void_invoice($1, $2, $3)', [id, reason, user.id]), reason);
  res.json({ ok: true });
});

/* ------------------------------ TT-06: công nợ ------------------------------ */

router.get('/debts', requirePerm('TT-06'), async (req, res) => {
  const { q } = z.object({ q: z.string().trim().optional() }).parse(req.query);
  const rows = await query(
    `SELECT d.*, (SELECT sum(total_debt) FROM rpt_patient_debts) AS grand_total
     FROM rpt_patient_debts d
     WHERE $1::text IS NULL OR lower(d.full_name) LIKE '%' || lower($1) || '%'
        OR d.patient_code ILIKE '%' || $1 || '%' OR d.phone LIKE $1 || '%'
     ORDER BY d.total_debt DESC`,
    [q || null],
  );
  res.json(rows);
});

router.get('/debts/:patientId', requirePerm('TT-06'), async (req, res) => {
  const rows = await query(
    `SELECT i.id, i.invoice_code, i.invoice_type, i.status, i.issued_at, i.total_amount, i.paid_amount, i.balance_due,
            tr.record_code, tp.plan_code, tp.name AS plan_name
     FROM invoices i
     LEFT JOIN treatment_records tr ON tr.id = i.treatment_record_id
     LEFT JOIN treatment_plans tp ON tp.id = i.treatment_plan_id
     WHERE i.patient_id = $1 AND i.status IN ('UNPAID', 'PARTIALLY_PAID')
     ORDER BY i.issued_at`,
    [idParam(String(req.params.patientId))],
  );
  res.json(rows);
});

/* ------------------------------ TT-07: chốt két ------------------------------ */

router.get('/cash-closing/summary', requirePerm('TT-07'), async (req, res) => {
  const user = currentUser(req);
  const f = z.object({ date: dateStr.optional(), shift: shift.optional() }).parse(req.query);
  const ctx = await queryOne<{ work_date: string; shift: string; current_date: string; current_shift: string }>(
    `SELECT coalesce($1::date, clinic_local(now())::date) AS work_date,
            coalesce($2::text, ${CURRENT_SHIFT_SQL}) AS shift,
            clinic_local(now())::date AS current_date,
            ${CURRENT_SHIFT_SQL} AS current_shift`,
    [f.date ?? null, f.shift ?? null],
  );
  const { work_date, shift: workShift } = ctx!;

  const [payments, closing] = await Promise.all([
    query(
      `SELECT pm.id, pm.receipt_code, pm.amount, pm.method, pm.transaction_ref, pm.paid_at, pm.note,
              pm.cash_closing_id IS NOT NULL AS is_closed,
              i.id AS invoice_id, i.invoice_code, p.patient_code, p.full_name AS patient_name
       FROM payments pm
       JOIN invoices i ON i.id = pm.invoice_id
       JOIN patients p ON p.id = i.patient_id
       WHERE pm.received_by = $1 AND pm.work_date = $2 AND pm.shift = $3
       ORDER BY pm.paid_at`,
      [user.id, work_date, workShift],
    ),
    queryOne(
      `SELECT c.*, s.full_name AS receptionist_name FROM cash_closings c JOIN staff s ON s.id = c.receptionist_id
       WHERE c.receptionist_id = $1 AND c.work_date = $2 AND c.shift = $3`,
      [user.id, work_date, workShift],
    ),
  ]);

  const sum = (method: string) =>
    payments.filter((p) => p.method === method).reduce((total, p) => total + Number(p.amount), 0);
  res.json({
    ...ctx,
    payments,
    cash_total: sum('CASH'),
    transfer_total: sum('BANK_TRANSFER'),
    closing,
  });
});

router.post('/cash-closings', requirePerm('TT-07'), async (req, res) => {
  const user = currentUser(req);
  const body = z
    .object({
      work_date: dateStr,
      shift,
      counted_cash: z.coerce.number().int('Số tiền phải là số nguyên đồng').min(0, 'Tiền đếm không được âm'),
      note: optionalText,
    })
    .parse(req.body);

  const check = await queryOne<{ future_date: boolean; not_started: boolean }>(
    `SELECT $1::date > clinic_local(now())::date AS future_date,
            $1::date = clinic_local(now())::date AND $2::text = 'AFTERNOON' AND ${CURRENT_SHIFT_SQL} = 'MORNING' AS not_started`,
    [body.work_date, body.shift],
  );
  if (check?.future_date) throw badRequest('Không thể chốt két cho ngày trong tương lai');
  if (check?.not_started) throw badRequest('Ca chiều hôm nay chưa bắt đầu (từ 14:00) — chưa thể chốt két');

  const row = await withTx(user.id, (db) =>
    queryOne<{ id: number }>(
      'SELECT close_cash_drawer($1, $2, $3, $4, $5) AS id',
      [user.id, body.work_date, body.shift, body.counted_cash, body.note ?? null],
      db,
    ),
  );
  res.status(201).json({ id: row!.id });
});

router.get('/cash-closings', requirePerm('TT-07'), async (req, res) => {
  const user = currentUser(req);
  const f = z.object({ date_from: dateStr.optional(), date_to: dateStr.optional() }).parse(req.query);
  const rows = await query(
    `SELECT c.id, c.receptionist_id, s.staff_code, s.full_name AS receptionist_name, c.work_date, c.shift,
            c.expected_cash, c.counted_cash, c.difference, c.note, c.closed_at,
            (SELECT count(*) FROM payments pm WHERE pm.cash_closing_id = c.id) AS payment_count,
            (SELECT coalesce(sum(pm.amount), 0) FROM payments pm
             WHERE pm.cash_closing_id = c.id AND pm.method = 'BANK_TRANSFER') AS transfer_total
     FROM cash_closings c JOIN staff s ON s.id = c.receptionist_id
     WHERE ($1::bigint IS NULL OR c.receptionist_id = $1)
       AND ($2::date IS NULL OR c.work_date >= $2)
       AND ($3::date IS NULL OR c.work_date <= $3)
     ORDER BY c.work_date DESC, (c.shift = 'AFTERNOON') DESC, s.staff_code
     LIMIT 200`,
    [user.role === 'MANAGER' ? null : user.id, f.date_from ?? null, f.date_to ?? null],
  );
  res.json(rows);
});

export default router;
