// Phiếu điều trị: DT-01 … DT-04, DT-06, DT-08, DT-09 (hàng chờ, phiếu, đơn thuốc, vật tư, lịch sử sửa)
import { Router } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { currentUser, hasPerm, requirePerm } from '../auth';
import { query, queryOne, withTx } from '../db';
import { badRequest, conflict, forbidden, notFound } from '../errors';
import { dateStr, idParam, optionalText } from '../validate';

const router = Router();

// Express 5 khai báo req.params là string | string[]
const routeId = (value: string | string[] | undefined) => idParam(Array.isArray(value) ? value[0] : value);

const READ_PERMS = ['DT-02', 'TT-01', 'BN-05'];
const FDI = /^([1-4][1-8]|[5-8][1-5])$/;
const JAW = ['FULL', 'UPPER', 'LOWER'];
const STATUSES = ['DRAFT', 'PENDING_PAYMENT', 'INVOICED', 'CANCELLED'] as const;

interface RecordRow {
  id: number;
  record_code: string;
  patient_id: number;
  appointment_id: number | null;
  status: (typeof STATUSES)[number];
  treatment_plan_id: number | null;
  plan_session_no: number | null;
}

async function lockRecord(db: PoolClient, id: number): Promise<RecordRow> {
  const rec = await queryOne<RecordRow>(
    `SELECT id, record_code, patient_id, appointment_id, status, treatment_plan_id, plan_session_no
     FROM treatment_records WHERE id = $1 FOR UPDATE`,
    [id],
    db,
  );
  if (!rec) throw notFound('Không tìm thấy phiếu điều trị');
  return rec;
}

/** Phiếu đã lập hóa đơn / đã hủy thì khóa; phiếu không còn nháp thì cần DT-08 + lý do sửa */
function assertEditable(req: Parameters<typeof currentUser>[0], rec: RecordRow, changeReason: string | null | undefined) {
  if (rec.status === 'INVOICED') {
    throw conflict('Phiếu đã lập hóa đơn — cần Quản lý hủy hóa đơn trước khi sửa');
  }
  if (rec.status === 'CANCELLED') throw conflict('Phiếu đã hủy, không thể sửa');
  if (rec.status !== 'DRAFT') {
    if (!hasPerm(req, 'DT-08')) throw forbidden();
    if (!changeReason) throw badRequest('Phiếu đã hoàn tất khám — phải nhập lý do sửa');
  }
}

/* --------------------------------- DT-01 --------------------------------- */

router.get('/queue', requirePerm('DT-01'), async (req, res) => {
  const { doctor_id } = z.object({ doctor_id: z.coerce.number().int().positive().optional() }).parse(req.query);
  const doctorId = doctor_id ?? null;

  const waiting = await query(
    `SELECT q.*, p.gender, p.medical_history
     FROM v_waiting_queue q JOIN patients p ON p.id = q.patient_id
     WHERE $1::bigint IS NULL OR q.doctor_id = $1`,
    [doctorId],
  );

  const inTreatment = await query(
    `SELECT * FROM (
       SELECT DISTINCT ON (a.booking_group_id)
              a.id AS appointment_id, a.booking_group_id, a.checked_in_at, a.start_at,
              a.doctor_id, d.full_name AS doctor_name, a.chair_id, c.name AS chair_name,
              a.patient_id, p.patient_code, p.full_name AS patient_name, p.date_of_birth,
              s.name AS service_name, r.id AS record_id, r.status AS record_status
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       JOIN staff d ON d.id = a.doctor_id
       JOIN chairs c ON c.id = a.chair_id
       LEFT JOIN services s ON s.id = a.service_id
       LEFT JOIN LATERAL (
         SELECT tr.id, tr.status FROM treatment_records tr
         JOIN appointments a2 ON a2.id = tr.appointment_id
         WHERE a2.booking_group_id = a.booking_group_id AND tr.status <> 'CANCELLED'
         LIMIT 1
       ) r ON true
       WHERE a.status = 'IN_TREATMENT'
         AND clinic_local(a.start_at)::date = clinic_local(now())::date
         AND ($1::bigint IS NULL OR a.doctor_id = $1)
       ORDER BY a.booking_group_id, a.start_at
     ) t ORDER BY checked_in_at`,
    [doctorId],
  );

  res.json({ waiting, in_treatment: inTreatment });
});

/* ------------------------- DT-02: bắt đầu khám ------------------------- */

router.post('/from-appointment/:appointmentId', requirePerm('DT-02'), async (req, res) => {
  const user = currentUser(req);
  const appointmentId = routeId(req.params.appointmentId);

  const result = await withTx(user.id, async (db) => {
    const appt = await queryOne<{ booking_group_id: string }>(
      'SELECT booking_group_id FROM appointments WHERE id = $1',
      [appointmentId],
      db,
    );
    if (!appt) throw notFound('Không tìm thấy lịch hẹn');

    const slots = await query<{
      id: number;
      patient_id: number;
      doctor_id: number;
      chair_id: number;
      status: string;
    }>(
      `SELECT id, patient_id, doctor_id, chair_id, status FROM appointments
       WHERE booking_group_id = $1 ORDER BY start_at FOR UPDATE`,
      [appt.booking_group_id],
      db,
    );
    const first = slots[0];

    const existing = await queryOne<{ id: number }>(
      `SELECT tr.id FROM treatment_records tr
       JOIN appointments a ON a.id = tr.appointment_id
       WHERE a.booking_group_id = $1 AND tr.status <> 'CANCELLED'`,
      [appt.booking_group_id],
      db,
    );
    if (existing) return { id: existing.id, created: false };

    if (first.status === 'CANCELLED') throw badRequest('Lịch hẹn đã hủy');
    if (first.status === 'BOOKED') throw badRequest('Bệnh nhân chưa được tiếp đón (check-in)');
    if (first.status === 'COMPLETED') throw badRequest('Lịch hẹn đã hoàn tất');

    const rec = await queryOne<{ id: number }>(
      `INSERT INTO treatment_records (patient_id, appointment_id, primary_doctor_id, chair_id, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $5) RETURNING id`,
      [first.patient_id, first.id, first.doctor_id, first.chair_id, user.id],
      db,
    );
    await db.query(
      `UPDATE appointments SET status = 'IN_TREATMENT', updated_by = $2
       WHERE booking_group_id = $1 AND status = 'ARRIVED'`,
      [appt.booking_group_id, user.id],
    );
    return { id: rec!.id, created: true };
  });

  res.status(result.created ? 201 : 200).json({ id: result.id });
});

/* ------------------------------ Danh sách ------------------------------ */

router.get('/', requirePerm(...READ_PERMS), async (req, res) => {
  const f = z
    .object({
      status: z.enum(STATUSES).optional(),
      date_from: dateStr.optional(),
      date_to: dateStr.optional(),
      doctor_id: z.coerce.number().int().positive().optional(),
      q: z.string().trim().optional(),
    })
    .parse(req.query);

  const where = `
    ($1::date IS NULL OR clinic_local(tr.visit_at)::date >= $1)
    AND ($2::date IS NULL OR clinic_local(tr.visit_at)::date <= $2)
    AND ($3::bigint IS NULL OR tr.primary_doctor_id = $3
         OR EXISTS (SELECT 1 FROM treatment_record_items i
                    WHERE i.treatment_record_id = tr.id AND i.performing_doctor_id = $3))
    AND ($4::text IS NULL OR lower(p.full_name) LIKE '%' || lower($4) || '%'
         OR p.patient_code ILIKE $4 OR tr.record_code ILIKE $4 OR p.phone LIKE $4 || '%')`;
  const params = [f.date_from ?? null, f.date_to ?? null, f.doctor_id ?? null, f.q || null];

  const rows = await query(
    `SELECT tr.id, tr.record_code, tr.visit_at, tr.status, tr.diagnosis,
            tr.patient_id, p.patient_code, p.full_name AS patient_name,
            tr.primary_doctor_id, d.full_name AS doctor_name, c.name AS chair_name,
            tp.plan_code, tr.plan_session_no,
            (SELECT count(*) FROM treatment_record_items i WHERE i.treatment_record_id = tr.id) AS line_count,
            inv.id AS invoice_id, inv.invoice_code, inv.status AS invoice_status
     FROM treatment_records tr
     JOIN patients p ON p.id = tr.patient_id
     JOIN staff d ON d.id = tr.primary_doctor_id
     LEFT JOIN chairs c ON c.id = tr.chair_id
     LEFT JOIN treatment_plans tp ON tp.id = tr.treatment_plan_id
     LEFT JOIN LATERAL (
       SELECT id, invoice_code, status FROM invoices
       WHERE treatment_record_id = tr.id AND status <> 'VOIDED' LIMIT 1
     ) inv ON true
     WHERE ${where} AND ($5::text IS NULL OR tr.status = $5)
     ORDER BY tr.visit_at DESC
     LIMIT 300`,
    [...params, f.status ?? null],
  );

  const countRows = await query<{ status: string; count: number }>(
    `SELECT tr.status, count(*) AS count
     FROM treatment_records tr JOIN patients p ON p.id = tr.patient_id
     WHERE ${where} GROUP BY tr.status`,
    params,
  );
  const counts = Object.fromEntries(countRows.map((r) => [r.status, r.count]));

  res.json({ rows, counts });
});

/* ------------------------------- Chi tiết ------------------------------- */

router.get('/:id', requirePerm(...READ_PERMS), async (req, res) => {
  const id = routeId(req.params.id);
  const record = await queryOne(
    `SELECT tr.*, d.full_name AS primary_doctor_name, c.name AS chair_name,
            cb.full_name AS created_by_name, ub.full_name AS updated_by_name,
            a.booking_group_id, a.service_id AS appointment_service_id
     FROM treatment_records tr
     JOIN staff d ON d.id = tr.primary_doctor_id
     LEFT JOIN chairs c ON c.id = tr.chair_id
     LEFT JOIN staff cb ON cb.id = tr.created_by
     LEFT JOIN staff ub ON ub.id = tr.updated_by
     LEFT JOIN appointments a ON a.id = tr.appointment_id
     WHERE tr.id = $1`,
    [id],
  );
  if (!record) throw notFound('Không tìm thấy phiếu điều trị');

  const [patient, items, prescriptions, materials, plans, invoice] = await Promise.all([
    queryOne(
      `SELECT id, patient_code, full_name, date_of_birth, gender, phone, medical_history, note, status
       FROM patients WHERE id = $1`,
      [record.patient_id],
    ),
    query(
      `SELECT i.*, s.code AS service_code, s.name AS service_name, s.tooth_scope, s.unit AS service_unit,
              d.full_name AS performing_doctor_name
       FROM treatment_record_items i
       JOIN services s ON s.id = i.service_id
       JOIN staff d ON d.id = i.performing_doctor_id
       WHERE i.treatment_record_id = $1 ORDER BY i.line_no`,
      [id],
    ),
    query(
      `SELECT pi.*, it.current_stock, it.code AS item_code
       FROM prescription_items pi LEFT JOIN items it ON it.id = pi.item_id
       WHERE pi.treatment_record_id = $1 ORDER BY pi.id`,
      [id],
    ),
    query(
      `SELECT m.*, it.code AS item_code, it.name AS item_name, it.unit, it.item_type, it.current_stock, it.min_stock
       FROM treatment_record_materials m JOIN items it ON it.id = m.item_id
       WHERE m.treatment_record_id = $1 ORDER BY it.item_type DESC, it.name`,
      [id],
    ),
    // Liệu trình đang điều trị của bệnh nhân + liệu trình đang gắn (kể cả đã kết thúc)
    query(
      `SELECT tp.id, tp.plan_code, tp.name, tp.plan_type, tp.status, tp.service_id, s.name AS service_name,
              tp.expected_sessions,
              (SELECT count(*) FROM treatment_records r
               WHERE r.treatment_plan_id = tp.id AND r.status <> 'CANCELLED') AS completed_sessions,
              (SELECT max(r.plan_session_no) FROM treatment_records r
               WHERE r.treatment_plan_id = tp.id AND r.status <> 'CANCELLED' AND r.id <> $3) AS last_session_no
       FROM treatment_plans tp LEFT JOIN services s ON s.id = tp.service_id
       WHERE tp.patient_id = $1 AND (tp.status = 'ACTIVE' OR tp.id = $2)
       ORDER BY tp.started_on DESC`,
      [record.patient_id, record.treatment_plan_id, id],
    ),
    queryOne(
      `SELECT id, invoice_code, status, total_amount, balance_due FROM invoices
       WHERE treatment_record_id = $1 AND status <> 'VOIDED' LIMIT 1`,
      [id],
    ),
  ]);

  res.json({
    record,
    patient,
    items,
    prescriptions,
    materials,
    plan: plans.find((p) => p.id === record.treatment_plan_id) ?? null,
    active_plans: plans,
    invoice,
  });
});

/* ------------------- DT-02/03/04 lưu phiếu, DT-08 sửa ------------------- */

const itemSchema = z.object({
  id: z.number().int().positive().nullish(),
  service_id: z.number().int().positive('Chọn dịch vụ'),
  tooth_code: z.string().trim().toUpperCase().min(1, 'Chọn số răng / hàm'),
  performing_doctor_id: z.number().int().positive('Chọn bác sĩ thực hiện'),
  quantity: z.coerce.number().positive().default(1),
  is_plan_package: z.boolean().default(false),
  note: optionalText,
});

const prescriptionSchema = z
  .object({
    id: z.number().int().positive().nullish(),
    item_id: z.number().int().positive().nullish(),
    medicine_name: z.string().trim().min(1, 'Nhập tên thuốc'),
    dosage: z.string().trim().min(1, 'Nhập liều dùng'),
    quantity: z.coerce.number().positive('Số lượng phải lớn hơn 0'),
    unit: optionalText,
    is_external: z.boolean().default(false),
    note: optionalText,
  })
  .refine((r) => r.is_external || r.item_id, { message: 'Thuốc phát tại phòng khám phải chọn từ danh mục kho' });

const saveSchema = z.object({
  chief_complaint: optionalText,
  diagnosis: optionalText,
  note: optionalText,
  treatment_plan_id: z.number().int().positive().nullish(),
  plan_session_no: z.number().int().positive().nullish(),
  items: z.array(itemSchema).default([]),
  prescriptions: z.array(prescriptionSchema).default([]),
  change_reason: optionalText,
});

interface RxRow {
  id: number;
  item_id: number | null;
  medicine_name: string;
  dosage: string;
  quantity: number;
  unit: string | null;
  is_external: boolean;
  note: string | null;
}

/** Đơn thuốc gửi lên có khác đơn đang lưu không (để chặn người không có DT-03) */
function prescriptionsChanged(stored: RxRow[], incoming: z.infer<typeof prescriptionSchema>[]): boolean {
  if (stored.length !== incoming.length) return true;
  const byId = new Map(stored.map((s) => [s.id, s]));
  return incoming.some((p) => {
    const s = p.id ? byId.get(p.id) : undefined;
    if (!s) return true;
    return (
      (p.item_id ?? null) !== (s.item_id ?? null) ||
      p.medicine_name !== s.medicine_name ||
      p.dosage !== s.dosage ||
      Number(p.quantity) !== Number(s.quantity) ||
      (p.unit ?? null) !== (s.unit ?? null) ||
      p.is_external !== s.is_external ||
      (p.note ?? null) !== (s.note ?? null)
    );
  });
}

/** Đồng bộ vật tư theo định mức: dòng chưa chỉnh tay thì theo định mức mới, dòng bác sĩ đã chỉnh giữ nguyên */
async function syncMaterials(db: PoolClient, recordId: number) {
  await db.query(
    `WITH norms AS (
       SELECT n.item_id, sum(n.quantity * i.quantity) AS qty
       FROM treatment_record_items i JOIN service_material_norms n ON n.service_id = i.service_id
       WHERE i.treatment_record_id = $1 GROUP BY n.item_id
     ), target AS (
       SELECT m.id, coalesce(norms.qty, 0) AS qty
       FROM treatment_record_materials m LEFT JOIN norms ON norms.item_id = m.item_id
       WHERE m.treatment_record_id = $1
     )
     UPDATE treatment_record_materials m
     SET norm_quantity = t.qty,
         actual_quantity = CASE WHEN m.actual_quantity = m.norm_quantity THEN t.qty ELSE m.actual_quantity END
     FROM target t
     WHERE m.id = t.id AND (m.norm_quantity <> t.qty)`,
    [recordId],
  );
  await db.query(
    `DELETE FROM treatment_record_materials
     WHERE treatment_record_id = $1 AND norm_quantity = 0 AND actual_quantity = 0`,
    [recordId],
  );
  await db.query('SELECT fill_material_norms($1)', [recordId]);
}

router.put('/:id', requirePerm('DT-02', 'DT-08'), async (req, res) => {
  const user = currentUser(req);
  const id = routeId(req.params.id);
  const body = saveSchema.parse(req.body);

  // DT-02: kiểm tra số răng theo phạm vi dịch vụ
  const serviceIds = [...new Set(body.items.map((i) => i.service_id))];
  const services = await query<{ id: number; name: string; tooth_scope: string }>(
    'SELECT id, name, tooth_scope FROM services WHERE id = ANY($1::bigint[])',
    [serviceIds],
  );
  const serviceMap = new Map(services.map((s) => [s.id, s]));
  body.items.forEach((item, idx) => {
    const svc = serviceMap.get(item.service_id);
    if (!svc) throw badRequest(`Dòng ${idx + 1}: dịch vụ không tồn tại`);
    const isTooth = FDI.test(item.tooth_code);
    const isJaw = JAW.includes(item.tooth_code);
    if (!isTooth && !isJaw) throw badRequest(`Dòng ${idx + 1}: số răng không hợp lệ (${item.tooth_code})`);
    if (svc.tooth_scope === 'TOOTH' && !isTooth) {
      throw badRequest(`Dòng ${idx + 1}: «${svc.name}» phải chọn số răng cụ thể`);
    }
    if (svc.tooth_scope === 'JAW' && !isJaw) {
      throw badRequest(`Dòng ${idx + 1}: «${svc.name}» chỉ chọn Toàn hàm / Hàm trên / Hàm dưới`);
    }
  });
  if (body.items.some((i) => i.is_plan_package) && !body.treatment_plan_id) {
    throw badRequest('Dòng trọn gói phải gắn phiếu vào một liệu trình');
  }
  const doctorIds = [...new Set(body.items.map((i) => i.performing_doctor_id))];
  const doctors = await query<{ id: number }>(
    `SELECT s.id FROM staff s JOIN roles r ON r.id = s.role_id
     WHERE s.id = ANY($1::bigint[]) AND r.code = 'DOCTOR'`,
    [doctorIds],
  );
  if (doctors.length !== doctorIds.length) throw badRequest('Bác sĩ thực hiện không hợp lệ');

  await withTx(
    user.id,
    async (db) => {
      const rec = await lockRecord(db, id);
      assertEditable(req, rec, body.change_reason);

      // DT-04: gắn buổi vào liệu trình — so với giá trị đang lưu vì giao diện luôn gửi lại toàn bộ phiếu
      let planId = body.treatment_plan_id ?? null;
      let sessionNo = body.plan_session_no ?? null;
      if (!hasPerm(req, 'DT-04')) {
        const storedPlan = rec.treatment_plan_id ?? null;
        if (planId !== storedPlan || (sessionNo !== null && sessionNo !== (rec.plan_session_no ?? null))) {
          throw forbidden('Bạn không có quyền gắn buổi vào liệu trình (DT-04)');
        }
        sessionNo = rec.plan_session_no ?? null;
      }
      if (planId) {
        const plan = await queryOne<{ patient_id: number; status: string }>(
          'SELECT patient_id, status FROM treatment_plans WHERE id = $1',
          [planId],
          db,
        );
        if (!plan || plan.patient_id !== rec.patient_id) throw badRequest('Liệu trình không thuộc bệnh nhân này');
        if (plan.status !== 'ACTIVE' && planId !== rec.treatment_plan_id) {
          throw badRequest('Liệu trình đã kết thúc hoặc đã hủy');
        }
        if (!sessionNo) {
          const next = await queryOne<{ next: number }>(
            `SELECT coalesce(max(plan_session_no), 0) + 1 AS next FROM treatment_records
             WHERE treatment_plan_id = $1 AND status <> 'CANCELLED' AND id <> $2`,
            [planId, id],
            db,
          );
          sessionNo = next!.next;
        }
      } else {
        planId = null;
        sessionNo = null;
      }

      await db.query(
        `UPDATE treatment_records
         SET chief_complaint = $2, diagnosis = $3, note = $4, treatment_plan_id = $5, plan_session_no = $6,
             updated_by = $7
         WHERE id = $1`,
        [id, body.chief_complaint ?? null, body.diagnosis ?? null, body.note ?? null, planId, sessionNo, user.id],
      );

      // Dòng dịch vụ: xóa / cập nhật / thêm, đánh lại line_no theo thứ tự gửi lên
      const existing = await query<{ id: number; line_no: number }>(
        'SELECT id, line_no FROM treatment_record_items WHERE treatment_record_id = $1',
        [id],
        db,
      );
      const existingMap = new Map(existing.map((e) => [e.id, e]));
      const keepIds = body.items.filter((i) => i.id).map((i) => i.id!);
      for (const kid of keepIds) {
        if (!existingMap.has(kid)) throw badRequest('Dòng dịch vụ không thuộc phiếu này');
      }
      const removeIds = existing.filter((e) => !keepIds.includes(e.id)).map((e) => e.id);
      if (removeIds.length) {
        await db.query('DELETE FROM treatment_record_items WHERE id = ANY($1::bigint[])', [removeIds]);
      }
      const moving = body.items
        .map((item, idx) => ({ item, lineNo: idx + 1 }))
        .filter(({ item, lineNo }) => item.id && existingMap.get(item.id)!.line_no !== lineNo)
        .map(({ item }) => item.id!);
      if (moving.length) {
        await db.query('UPDATE treatment_record_items SET line_no = -line_no WHERE id = ANY($1::bigint[])', [moving]);
      }
      for (const [idx, item] of body.items.entries()) {
        const values = [
          item.service_id,
          item.tooth_code,
          item.performing_doctor_id,
          item.quantity,
          item.is_plan_package,
          item.note ?? null,
          idx + 1,
        ];
        if (item.id) {
          await db.query(
            `UPDATE treatment_record_items
             SET service_id = $1, tooth_code = $2, performing_doctor_id = $3, quantity = $4,
                 is_plan_package = $5, note = $6, line_no = $7
             WHERE id = $8`,
            [...values, item.id],
          );
        } else {
          await db.query(
            `INSERT INTO treatment_record_items
               (service_id, tooth_code, performing_doctor_id, quantity, is_plan_package, note, line_no, treatment_record_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [...values, id],
          );
        }
      }

      // DT-03: đơn thuốc (trigger tự trừ/hoàn kho cho thuốc phát tại chỗ)
      const existingRx = await query<RxRow>(
        `SELECT id, item_id, medicine_name, dosage, quantity, unit, is_external, note
         FROM prescription_items WHERE treatment_record_id = $1`,
        [id],
        db,
      );
      if (!hasPerm(req, 'DT-03') && prescriptionsChanged(existingRx, body.prescriptions)) {
        throw forbidden('Bạn không có quyền kê đơn thuốc (DT-03)');
      }
      const keepRx = body.prescriptions.filter((p) => p.id).map((p) => p.id!);
      for (const kid of keepRx) {
        if (!existingRx.some((e) => e.id === kid)) throw badRequest('Dòng đơn thuốc không thuộc phiếu này');
      }
      const removeRx = existingRx.filter((e) => !keepRx.includes(e.id)).map((e) => e.id);
      if (removeRx.length) {
        await db.query('DELETE FROM prescription_items WHERE id = ANY($1::bigint[])', [removeRx]);
      }
      for (const p of body.prescriptions) {
        const values = [
          p.is_external ? (p.item_id ?? null) : p.item_id,
          p.medicine_name,
          p.dosage,
          p.quantity,
          p.unit ?? null,
          p.is_external,
          p.note ?? null,
        ];
        if (p.id) {
          await db.query(
            `UPDATE prescription_items
             SET item_id = $1, medicine_name = $2, dosage = $3, quantity = $4, unit = $5, is_external = $6, note = $7
             WHERE id = $8`,
            [...values, p.id],
          );
        } else {
          await db.query(
            `INSERT INTO prescription_items
               (item_id, medicine_name, dosage, quantity, unit, is_external, note, treatment_record_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [...values, id],
          );
        }
      }

      // DT-06: trừ vật tư theo định mức (trigger cập nhật tồn kho, DT-07 cảnh báo dưới ngưỡng)
      await syncMaterials(db, id);
    },
    body.change_reason ?? undefined,
  );

  res.json({ ok: true });
});

/* --------------------- DT-02 bước 4: hoàn tất khám --------------------- */

router.post('/:id/complete', requirePerm('DT-02'), async (req, res) => {
  const user = currentUser(req);
  const id = routeId(req.params.id);
  await withTx(user.id, async (db) => {
    const rec = await lockRecord(db, id);
    if (rec.status !== 'DRAFT') throw conflict('Phiếu không ở trạng thái nháp');
    const lines = await queryOne<{ count: number }>(
      'SELECT count(*) AS count FROM treatment_record_items WHERE treatment_record_id = $1',
      [id],
      db,
    );
    if (!lines?.count) throw badRequest('Phiếu chưa có dòng dịch vụ nào');
    await syncMaterials(db, id);
    await db.query(`UPDATE treatment_records SET status = 'PENDING_PAYMENT', updated_by = $2 WHERE id = $1`, [
      id,
      user.id,
    ]);
    if (rec.appointment_id) {
      await db.query(
        `UPDATE appointments SET status = 'COMPLETED', updated_by = $2
         WHERE booking_group_id = (SELECT booking_group_id FROM appointments WHERE id = $1)
           AND status IN ('ARRIVED', 'IN_TREATMENT')`,
        [rec.appointment_id, user.id],
      );
    }
  });
  res.json({ ok: true });
});

/* --------------------- DT-06: chỉnh vật tư thực dùng --------------------- */

const materialsSchema = z.object({
  materials: z
    .array(
      z.object({
        item_id: z.number().int().positive(),
        actual_quantity: z.coerce.number().min(0, 'Số lượng không được âm'),
        note: optionalText,
      }),
    )
    .min(1),
  change_reason: optionalText,
});

router.put('/:id/materials', requirePerm('DT-02', 'DT-08'), async (req, res) => {
  const user = currentUser(req);
  const id = routeId(req.params.id);
  const body = materialsSchema.parse(req.body);

  await withTx(
    user.id,
    async (db) => {
      const rec = await lockRecord(db, id);
      assertEditable(req, rec, body.change_reason);
      for (const m of body.materials) {
        await db.query(
          `INSERT INTO treatment_record_materials (treatment_record_id, item_id, norm_quantity, actual_quantity, note)
           VALUES ($1, $2, 0, $3, $4)
           ON CONFLICT (treatment_record_id, item_id)
           DO UPDATE SET actual_quantity = EXCLUDED.actual_quantity, note = EXCLUDED.note`,
          [id, m.item_id, m.actual_quantity, m.note ?? null],
        );
      }
      await db.query(
        `DELETE FROM treatment_record_materials
         WHERE treatment_record_id = $1 AND norm_quantity = 0 AND actual_quantity = 0`,
        [id],
      );
    },
    body.change_reason ?? undefined,
  );
  res.json({ ok: true });
});

/* ------------------------- DT-09: lịch sử chỉnh sửa ------------------------- */

router.get('/:id/history', requirePerm(...READ_PERMS), async (req, res) => {
  const id = routeId(req.params.id);
  const rows = await query(
    `SELECT al.id, al.table_name, al.record_id, al.action, al.old_data, al.new_data, al.reason,
            al.changed_at, al.changed_by, s.full_name AS changed_by_name,
            op.plan_code || ' · ' || op.name AS old_plan_label,
            np.plan_code || ' · ' || np.name AS new_plan_label
     FROM audit_logs al
     LEFT JOIN staff s ON s.id = al.changed_by
     LEFT JOIN treatment_plans op
       ON al.table_name = 'treatment_records' AND op.id = (al.old_data ->> 'treatment_plan_id')::bigint
     LEFT JOIN treatment_plans np
       ON al.table_name = 'treatment_records' AND np.id = (al.new_data ->> 'treatment_plan_id')::bigint
     WHERE (al.table_name = 'treatment_records' AND al.record_id = $1)
        OR (al.table_name IN ('treatment_record_items', 'prescription_items', 'treatment_record_materials')
            AND coalesce(al.new_data, al.old_data) ->> 'treatment_record_id' = $1::text)
     ORDER BY al.changed_at DESC, al.id DESC
     LIMIT 500`,
    [id],
  );
  res.json(rows);
});

export default router;
