// Liệu trình: DT-05 (tạo, cập nhật số buổi, kết thúc), đợt thanh toán
import { Router } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { currentUser, requirePerm } from '../auth.js';
import { query, queryOne, withTx } from '../db.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { dateStr, idParam, money, optionalText } from '../validate.js';

const router = Router();

// Express 5 khai báo req.params là string | string[]
const routeId = (value: string | string[] | undefined) => idParam(Array.isArray(value) ? value[0] : value);

const READ_PERMS = ['DT-05', 'DT-02', 'TT-01', 'BN-05'];
const PLAN_TYPES = ['ORTHODONTIC', 'IMPLANT', 'OTHER'] as const;
const PLAN_STATUSES = ['ACTIVE', 'COMPLETED', 'CANCELLED'] as const;

const installmentSchema = z.object({
  id: z.number().int().positive().nullish(),
  installment_no: z.coerce.number().int().positive(),
  due_date: dateStr.nullish(),
  amount: money.refine((v) => v > 0, 'Số tiền mỗi đợt phải lớn hơn 0'),
  note: optionalText,
});

function checkInstallments(installments: z.infer<typeof installmentSchema>[], totalPrice: number) {
  if (!installments.length) throw badRequest('Phải có ít nhất một đợt thanh toán');
  const numbers = installments.map((i) => i.installment_no);
  if (new Set(numbers).size !== numbers.length) throw badRequest('Số thứ tự đợt thanh toán bị trùng');
  const sum = installments.reduce((s, i) => s + i.amount, 0);
  if (Math.abs(sum - totalPrice) > 0.001) {
    throw badRequest(`Tổng các đợt (${sum.toLocaleString('vi-VN')}) phải bằng tổng giá liệu trình (${totalPrice.toLocaleString('vi-VN')})`);
  }
}

async function assertDoctor(db: PoolClient, doctorId: number) {
  const ok = await queryOne(
    `SELECT 1 FROM staff s JOIN roles r ON r.id = s.role_id WHERE s.id = $1 AND r.code = 'DOCTOR' AND s.is_active`,
    [doctorId],
    db,
  );
  if (!ok) throw badRequest('Bác sĩ phụ trách không hợp lệ');
}

async function lockPlan(db: PoolClient, id: number) {
  const plan = await queryOne<{ id: number; status: string; total_price: number }>(
    'SELECT id, status, total_price FROM treatment_plans WHERE id = $1 FOR UPDATE',
    [id],
    db,
  );
  if (!plan) throw notFound('Không tìm thấy liệu trình');
  return plan;
}

const PROGRESS = `
  (SELECT count(*) FROM treatment_records r
   WHERE r.treatment_plan_id = tp.id AND r.status <> 'CANCELLED') AS completed_sessions,
  coalesce((SELECT sum(i.paid_amount) FROM invoices i
            WHERE i.treatment_plan_id = tp.id AND i.status <> 'VOIDED'), 0) AS paid_amount,
  (SELECT i.id FROM invoices i WHERE i.treatment_plan_id = tp.id AND i.status <> 'VOIDED' LIMIT 1) AS invoice_id`;

router.get('/', requirePerm(...READ_PERMS), async (req, res) => {
  const f = z
    .object({
      status: z.enum(PLAN_STATUSES).optional(),
      patient_id: z.coerce.number().int().positive().optional(),
      q: z.string().trim().optional(),
    })
    .parse(req.query);
  const where = `($1::bigint IS NULL OR tp.patient_id = $1)
    AND ($2::text IS NULL OR lower(p.full_name) LIKE '%' || lower($2) || '%'
         OR p.patient_code ILIKE $2 OR tp.plan_code ILIKE $2 OR lower(tp.name) LIKE '%' || lower($2) || '%')`;
  const params = [f.patient_id ?? null, f.q || null];

  const rows = await query(
    `SELECT tp.id, tp.plan_code, tp.name, tp.plan_type, tp.status, tp.total_price, tp.expected_sessions,
            tp.started_on, tp.ended_on, tp.patient_id, p.patient_code, p.full_name AS patient_name,
            tp.primary_doctor_id, d.full_name AS doctor_name, s.name AS service_name, ${PROGRESS}
     FROM treatment_plans tp
     JOIN patients p ON p.id = tp.patient_id
     JOIN staff d ON d.id = tp.primary_doctor_id
     LEFT JOIN services s ON s.id = tp.service_id
     WHERE ${where} AND ($3::text IS NULL OR tp.status = $3)
     ORDER BY (tp.status = 'ACTIVE') DESC, tp.started_on DESC, tp.id DESC`,
    [...params, f.status ?? null],
  );
  const countRows = await query<{ status: string; count: number }>(
    `SELECT tp.status, count(*) AS count FROM treatment_plans tp JOIN patients p ON p.id = tp.patient_id
     WHERE ${where} GROUP BY tp.status`,
    params,
  );
  res.json({ rows, counts: Object.fromEntries(countRows.map((r) => [r.status, r.count])) });
});

router.get('/:id', requirePerm(...READ_PERMS), async (req, res) => {
  const id = routeId(req.params.id);
  const plan = await queryOne(
    `SELECT tp.*, p.patient_code, p.full_name AS patient_name, p.date_of_birth, p.phone,
            d.full_name AS doctor_name, s.name AS service_name, cb.full_name AS created_by_name, ${PROGRESS}
     FROM treatment_plans tp
     JOIN patients p ON p.id = tp.patient_id
     JOIN staff d ON d.id = tp.primary_doctor_id
     LEFT JOIN services s ON s.id = tp.service_id
     LEFT JOIN staff cb ON cb.id = tp.created_by
     WHERE tp.id = $1`,
    [id],
  );
  if (!plan) throw notFound('Không tìm thấy liệu trình');

  const [installments, sessions, invoice] = await Promise.all([
    query(
      `SELECT tpi.*,
              coalesce((SELECT sum(pm.amount) FROM payments pm
                        JOIN invoices i ON i.id = pm.invoice_id AND i.status <> 'VOIDED'
                        WHERE pm.installment_id = tpi.id), 0) AS paid_amount
       FROM treatment_plan_installments tpi
       WHERE tpi.treatment_plan_id = $1 ORDER BY tpi.installment_no`,
      [id],
    ),
    query(
      `SELECT tr.id, tr.record_code, tr.plan_session_no, tr.visit_at, tr.status, tr.diagnosis,
              d.full_name AS doctor_name,
              (SELECT string_agg(s.name || CASE WHEN i.tooth_code IN ('FULL','UPPER','LOWER') THEN ''
                                                ELSE ' (R' || i.tooth_code || ')' END, ', ' ORDER BY i.line_no)
               FROM treatment_record_items i JOIN services s ON s.id = i.service_id
               WHERE i.treatment_record_id = tr.id) AS work_summary
       FROM treatment_records tr JOIN staff d ON d.id = tr.primary_doctor_id
       WHERE tr.treatment_plan_id = $1
       ORDER BY tr.plan_session_no NULLS LAST, tr.visit_at`,
      [id],
    ),
    queryOne(
      `SELECT id, invoice_code, status, total_amount, paid_amount, balance_due, issued_at FROM invoices
       WHERE treatment_plan_id = $1 AND status <> 'VOIDED' LIMIT 1`,
      [id],
    ),
  ]);

  res.json({ plan, installments, sessions, invoice });
});

const createSchema = z.object({
  patient_id: z.number().int().positive('Chọn bệnh nhân'),
  primary_doctor_id: z.number().int().positive('Chọn bác sĩ phụ trách'),
  service_id: z.number().int().positive().nullish(),
  name: z.string().trim().min(1, 'Nhập tên liệu trình').max(200),
  plan_type: z.enum(PLAN_TYPES),
  total_price: money,
  expected_sessions: z.coerce.number().int().positive('Số buổi dự kiến phải lớn hơn 0'),
  started_on: dateStr.nullish(),
  note: optionalText,
  installments: z.array(installmentSchema).default([]),
});

router.post('/', requirePerm('DT-05'), async (req, res) => {
  const user = currentUser(req);
  const body = createSchema.parse(req.body);
  checkInstallments(body.installments, body.total_price);

  const id = await withTx(user.id, async (db) => {
    const patient = await queryOne<{ status: string }>('SELECT status FROM patients WHERE id = $1', [body.patient_id], db);
    if (!patient) throw badRequest('Bệnh nhân không tồn tại');
    await assertDoctor(db, body.primary_doctor_id);

    const plan = await queryOne<{ id: number }>(
      `INSERT INTO treatment_plans (patient_id, primary_doctor_id, service_id, name, plan_type, total_price,
                                    expected_sessions, started_on, note, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, coalesce($8::date, clinic_local(now())::date), $9, $10, $10)
       RETURNING id`,
      [
        body.patient_id,
        body.primary_doctor_id,
        body.service_id ?? null,
        body.name,
        body.plan_type,
        body.total_price,
        body.expected_sessions,
        body.started_on ?? null,
        body.note ?? null,
        user.id,
      ],
      db,
    );
    for (const ins of body.installments) {
      await db.query(
        `INSERT INTO treatment_plan_installments (treatment_plan_id, installment_no, due_date, amount, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [plan!.id, ins.installment_no, ins.due_date ?? null, ins.amount, ins.note ?? null],
      );
    }
    return plan!.id;
  });
  res.status(201).json({ id });
});

const updateSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên liệu trình').max(200),
  expected_sessions: z.coerce.number().int().positive('Số buổi dự kiến phải lớn hơn 0'),
  primary_doctor_id: z.number().int().positive(),
  note: optionalText,
});

router.put('/:id', requirePerm('DT-05'), async (req, res) => {
  const user = currentUser(req);
  const id = routeId(req.params.id);
  const body = updateSchema.parse(req.body);
  await withTx(user.id, async (db) => {
    const plan = await lockPlan(db, id);
    if (plan.status !== 'ACTIVE') throw conflict('Chỉ sửa được liệu trình đang điều trị');
    await assertDoctor(db, body.primary_doctor_id);
    await db.query(
      `UPDATE treatment_plans
       SET name = $2, expected_sessions = $3, primary_doctor_id = $4, note = $5, updated_by = $6
       WHERE id = $1`,
      [id, body.name, body.expected_sessions, body.primary_doctor_id, body.note ?? null, user.id],
    );
  });
  res.json({ ok: true });
});

// Thay kế hoạch đợt thanh toán; đợt đã có lần thu thì giữ nguyên số thứ tự và số tiền
router.put('/:id/installments', requirePerm('DT-05'), async (req, res) => {
  const user = currentUser(req);
  const id = routeId(req.params.id);
  const { installments } = z.object({ installments: z.array(installmentSchema) }).parse(req.body);

  await withTx(user.id, async (db) => {
    const plan = await lockPlan(db, id);
    if (plan.status === 'CANCELLED') throw conflict('Liệu trình đã hủy');
    checkInstallments(installments, plan.total_price);

    const existing = await query<{ id: number; installment_no: number; amount: number; paid: number }>(
      `SELECT tpi.id, tpi.installment_no, tpi.amount,
              coalesce((SELECT sum(amount) FROM payments WHERE installment_id = tpi.id), 0) AS paid
       FROM treatment_plan_installments tpi WHERE tpi.treatment_plan_id = $1`,
      [id],
      db,
    );
    const byId = new Map(existing.map((e) => [e.id, e]));
    for (const ins of installments) {
      if (ins.id && !byId.has(ins.id)) throw badRequest('Đợt thanh toán không thuộc liệu trình này');
    }
    for (const e of existing.filter((x) => x.paid > 0)) {
      const incoming = installments.find((i) => i.id === e.id);
      if (!incoming) throw badRequest(`Đợt ${e.installment_no} đã có lần thu — không được xóa`);
      if (incoming.installment_no !== e.installment_no || incoming.amount !== e.amount) {
        throw badRequest(`Đợt ${e.installment_no} đã có lần thu — không được đổi số thứ tự hoặc số tiền`);
      }
    }

    const keepIds = installments.filter((i) => i.id).map((i) => i.id!);
    const removeIds = existing.filter((e) => !keepIds.includes(e.id)).map((e) => e.id);
    if (removeIds.length) {
      await db.query('DELETE FROM treatment_plan_installments WHERE id = ANY($1::bigint[])', [removeIds]);
    }
    const moving = installments.filter((i) => i.id && byId.get(i.id)!.installment_no !== i.installment_no);
    if (moving.length) {
      await db.query(
        // Dời tạm ra ngoài dải số đang dùng (CHECK installment_no > 0) để tránh trùng khóa khi đổi thứ tự
        'UPDATE treatment_plan_installments SET installment_no = installment_no + 1000 WHERE id = ANY($1::bigint[])',
        [moving.map((m) => m.id)],
      );
    }
    for (const ins of installments) {
      if (ins.id) {
        await db.query(
          `UPDATE treatment_plan_installments SET installment_no = $2, due_date = $3, amount = $4, note = $5
           WHERE id = $1`,
          [ins.id, ins.installment_no, ins.due_date ?? null, ins.amount, ins.note ?? null],
        );
      } else {
        await db.query(
          `INSERT INTO treatment_plan_installments (treatment_plan_id, installment_no, due_date, amount, note)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, ins.installment_no, ins.due_date ?? null, ins.amount, ins.note ?? null],
        );
      }
    }
  });
  res.json({ ok: true });
});

const closeSchema = z.object({ ended_on: dateStr.nullish(), note: optionalText });

async function closePlan(userId: number, id: number, status: 'COMPLETED' | 'CANCELLED', body: z.infer<typeof closeSchema>) {
  await withTx(userId, async (db) => {
    const plan = await lockPlan(db, id);
    if (plan.status !== 'ACTIVE') throw conflict('Liệu trình không ở trạng thái đang điều trị');
    await db.query(
      `UPDATE treatment_plans
       SET status = $2, ended_on = coalesce($3::date, clinic_local(now())::date),
           note = CASE WHEN $4::text IS NULL THEN note
                       ELSE concat_ws(E'\\n', note, $4::text) END,
           updated_by = $5
       WHERE id = $1`,
      [id, status, body.ended_on ?? null, body.note ?? null, userId],
    );
  });
}

router.post('/:id/complete', requirePerm('DT-05'), async (req, res) => {
  await closePlan(currentUser(req).id, routeId(req.params.id), 'COMPLETED', closeSchema.parse(req.body));
  res.json({ ok: true });
});

router.post('/:id/cancel', requirePerm('DT-05'), async (req, res) => {
  const body = closeSchema.parse(req.body);
  if (!body.note) throw badRequest('Phải ghi lý do hủy liệu trình');
  await closePlan(currentUser(req).id, routeId(req.params.id), 'CANCELLED', body);
  res.json({ ok: true });
});

export default router;
