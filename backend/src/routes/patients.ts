// Bệnh nhân: BN-01 … BN-06
import fs from 'node:fs/promises';
import path from 'node:path';
import { type NextFunction, type Request, type Response, Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { currentUser, hasPerm, requirePerm } from '../auth.js';
import { config } from '../config.js';
import { query, queryOne, type Queryable, withTx } from '../db.js';
import { badRequest, forbidden, HttpError, notFound } from '../errors.js';
import { dateStr, idParam, optionalText } from '../validate.js';

const router = Router();

/**
 * Chuẩn hóa từ khóa tìm kiếm: nếu là SĐT (có thể gõ kèm dấu cách, chấm, gạch, ngoặc hoặc +84)
 * thì bỏ ký tự phân cách và đổi đầu số +84/84 thành 0. Trả về { q, digits }.
 */
function normalizeKeyword(raw: string): { q: string; digits: boolean } {
  const compact = raw.replace(/[\s.\-()]/g, '');
  if (/^\+?\d+$/.test(compact)) {
    const q = compact.replace(/^\+?84(?=\d{9}$)/, '0').replace(/^\+/, '');
    return { q, digits: true };
  }
  return { q: raw, digits: false };
}

// BN-01: tìm theo SĐT (của bệnh nhân hoặc người giám hộ), mã BN hoặc tên — một SĐT có thể trả nhiều người
router.get('/search', requirePerm('BN-01'), async (req, res) => {
  const { q: raw } = z.object({ q: z.string().trim().min(1) }).parse(req.query);
  const { q, digits } = normalizeKeyword(raw);
  const rows = await query(
    `SELECT p.id, p.patient_code, p.full_name, p.date_of_birth, p.gender, p.phone, p.status,
            g.full_name AS guardian_name, g.relationship AS guardian_relationship, g.phone AS guardian_phone
     FROM patients p
     LEFT JOIN LATERAL (
       SELECT full_name, relationship, phone FROM patient_guardians
       WHERE patient_id = p.id ORDER BY is_primary DESC, id LIMIT 1
     ) g ON true
     WHERE ($2 AND (p.phone LIKE $1 || '%'
                    OR EXISTS (SELECT 1 FROM patient_guardians pg
                               WHERE pg.patient_id = p.id AND pg.phone LIKE $1 || '%')))
        OR (NOT $2 AND (lower(p.full_name) LIKE '%' || lower($1) || '%' OR p.patient_code ILIKE $1))
     ORDER BY p.status, p.full_name, p.date_of_birth
     LIMIT 30`,
    [q, digits],
  );
  res.json(rows);
});

/* ------------------------------------------------------------------------- */

const PAGE_SIZE = 20;

// Cùng điều kiện tìm như /search; $1 = từ khóa ('' = tất cả), $2 = từ khóa toàn chữ số
const SEARCH_COND = `($1 = ''
  OR ($2 AND (p.phone LIKE $1 || '%'
              OR EXISTS (SELECT 1 FROM patient_guardians pg WHERE pg.patient_id = p.id AND pg.phone LIKE $1 || '%')))
  OR (NOT $2 AND (lower(p.full_name) LIKE '%' || lower($1) || '%' OR p.patient_code ILIKE $1)))`;

const PRIMARY_GUARDIAN = `LEFT JOIN LATERAL (
    SELECT full_name, relationship, phone FROM patient_guardians
    WHERE patient_id = p.id ORDER BY is_primary DESC, id LIMIT 1
  ) g ON true`;

const phoneSchema = z
  .string()
  .trim()
  .regex(/^[0-9+ .-]{0,20}$/, 'Số điện thoại không hợp lệ')
  .transform((v) => (v === '' ? null : v.replace(/[ .-]/g, '').replace(/^\+?84(?=\d{9}$)/, '0')))
  .nullish();

const guardianSchema = z.object({
  full_name: z.string().trim().min(1, 'Nhập họ tên người giám hộ').max(150),
  relationship: z.string().trim().min(1, 'Nhập quan hệ với bệnh nhân').max(50),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+ .-]{6,20}$/, 'Số điện thoại người giám hộ không hợp lệ')
    .transform((v) => v.replace(/[ .-]/g, '').replace(/^\+?84(?=\d{9}$)/, '0')),
  is_primary: z.boolean().default(true),
  note: optionalText,
});

const patientFields = {
  full_name: z.string().trim().min(1, 'Nhập họ tên bệnh nhân').max(150),
  date_of_birth: dateStr.nullish(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullish(),
  phone: phoneSchema,
  email: optionalText,
  address: optionalText,
  medical_history: optionalText,
  note: optionalText,
};

const createSchema = z.object({
  ...patientFields,
  guardians: z.array(guardianSchema).default([]),
  is_legacy: z.boolean().default(false),
  legacy_record_no: optionalText,
  last_visit_at: dateStr.nullish(),
});

const updateSchema = z.object({
  ...patientFields,
  legacy_record_no: optionalText,
  status: z.enum(['ACTIVE', 'ARCHIVED']).default('ACTIVE'),
});

/** Kiểm tra ngày sinh (không ở tương lai) và trả về true nếu dưới 15 tuổi — tính theo ngày phòng khám */
async function checkDob(dob: string | null | undefined): Promise<boolean> {
  if (!dob) return false;
  const row = await queryOne<{ future: boolean; under15: boolean }>(
    `SELECT $1::date > clinic_local(now())::date AS future,
            date_part('year', age(clinic_local(now())::date, $1::date)) < 15 AS under15`,
    [dob],
  );
  if (row?.future) throw badRequest('Ngày sinh không được ở tương lai');
  return !!row?.under15;
}

async function ensurePatient(id: number): Promise<{ id: number; patient_code: string; date_of_birth: string | null }> {
  const p = await queryOne<{ id: number; patient_code: string; date_of_birth: string | null }>(
    'SELECT id, patient_code, date_of_birth FROM patients WHERE id = $1',
    [id],
  );
  if (!p) throw notFound('Không tìm thấy bệnh nhân');
  return p;
}

// BN-01: danh sách có phân trang
router.get('/', requirePerm('BN-01'), async (req, res) => {
  const { q: raw, status, page } = z
    .object({
      q: z.string().trim().default(''),
      status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
      page: z.coerce.number().int().min(1).default(1),
    })
    .parse(req.query);
  const { q, digits } = normalizeKeyword(raw);
  const params = [q, digits, status ?? null];
  const where = `${SEARCH_COND} AND ($3::text IS NULL OR p.status = $3)`;

  const [rows, total] = await Promise.all([
    query(
      `SELECT p.id, p.patient_code, p.full_name, p.date_of_birth, p.gender, p.phone, p.status,
              p.is_legacy, p.legacy_record_no, p.last_visit_at, p.created_at,
              g.full_name AS guardian_name, g.relationship AS guardian_relationship, g.phone AS guardian_phone
       FROM patients p ${PRIMARY_GUARDIAN}
       WHERE ${where}
       ORDER BY CASE WHEN $1 = '' THEN NULL ELSE p.full_name END, p.id DESC
       LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
      params,
    ),
    queryOne<{ total: number }>(`SELECT count(*) AS total FROM patients p WHERE ${where}`, params),
  ]);
  res.json({ rows, total: total?.total ?? 0, page, page_size: PAGE_SIZE });
});

// BN-02 «include» Kiểm tra trùng hồ sơ
router.get('/check-duplicates', requirePerm('BN-02', 'BN-04', 'BN-06'), async (req, res) => {
  const { phone, full_name, date_of_birth, exclude_id } = z
    .object({
      phone: phoneSchema,
      full_name: z.string().trim().min(1),
      date_of_birth: dateStr.nullish().or(z.literal('').transform(() => null)),
      exclude_id: z.coerce.number().int().positive().optional(),
    })
    .parse(req.query);

  const rows = await query(
    `SELECT p.id, p.patient_code, p.full_name, p.date_of_birth, p.gender, p.phone, p.status,
            CASE
              WHEN $1::text IS NOT NULL AND p.phone = $1 AND p.date_of_birth = $3::date THEN 'Trùng SĐT và ngày sinh'
              WHEN p.date_of_birth = $3::date AND lower(p.full_name) = lower($2) THEN 'Trùng họ tên và ngày sinh'
              ELSE 'Cùng SĐT, họ tên gần giống'
            END AS match_reason
     FROM patients p
     WHERE ($4::bigint IS NULL OR p.id <> $4)
       AND (($1::text IS NOT NULL AND p.phone = $1 AND p.date_of_birth = $3::date)
         OR (p.date_of_birth = $3::date AND lower(p.full_name) = lower($2))
         OR ($1::text IS NOT NULL AND p.phone = $1 AND similarity(lower(p.full_name), lower($2)) > 0.5))
     ORDER BY p.full_name
     LIMIT 20`,
    [phone ?? null, full_name, date_of_birth ?? null, exclude_id ?? null],
  );
  res.json(rows);
});

// BN-02 đăng ký mới / BN-06 số hóa hồ sơ giấy (+ BN-03 người giám hộ)
router.post('/', requirePerm('BN-02', 'BN-06'), async (req, res) => {
  const user = currentUser(req);
  const body = createSchema.parse(req.body);
  if (body.is_legacy && !hasPerm(req, 'BN-06')) throw forbidden('Bạn không có quyền số hóa hồ sơ giấy');
  if (!body.is_legacy && !hasPerm(req, 'BN-02')) throw forbidden('Bạn không có quyền đăng ký bệnh nhân mới');

  const under15 = await checkDob(body.date_of_birth);
  if (under15 && body.guardians.length === 0) {
    throw badRequest('Bệnh nhân dưới 15 tuổi phải có ít nhất một người giám hộ');
  }

  const created = await withTx(user.id, async (db) => {
    const patient = await queryOne<{ id: number; patient_code: string }>(
      `INSERT INTO patients (full_name, date_of_birth, gender, phone, email, address, medical_history, note,
                             is_legacy, legacy_record_no, last_visit_at, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               $11::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh', $12, $12)
       RETURNING id, patient_code`,
      [
        body.full_name,
        body.date_of_birth ?? null,
        body.gender ?? null,
        body.phone ?? null,
        body.email ?? null,
        body.address ?? null,
        body.medical_history ?? null,
        body.note ?? null,
        body.is_legacy,
        body.is_legacy ? (body.legacy_record_no ?? null) : null,
        body.is_legacy ? (body.last_visit_at ?? null) : null,
        user.id,
      ],
      db,
    );
    let primarySet = false;
    for (const g of body.guardians) {
      const isPrimary: boolean = g.is_primary && !primarySet;
      primarySet ||= isPrimary;
      await db.query(
        `INSERT INTO patient_guardians (patient_id, full_name, relationship, phone, is_primary, note)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [patient!.id, g.full_name, g.relationship, g.phone, isPrimary, g.note ?? null],
      );
    }
    if (body.guardians.length && !primarySet) {
      await db.query(
        `UPDATE patient_guardians SET is_primary = true
         WHERE id = (SELECT min(id) FROM patient_guardians WHERE patient_id = $1)`,
        [patient!.id],
      );
    }
    return patient!;
  });
  res.status(201).json(created);
});

// BN-05: hồ sơ bệnh nhân (đồng thời dùng để điền sẵn bệnh nhân ở module khác)
router.get('/:id', requirePerm('BN-01', 'BN-05'), async (req, res) => {
  const id = idParam(req.params.id);
  const patient = await queryOne(
    `SELECT p.*, cb.full_name AS created_by_name, ub.full_name AS updated_by_name,
            g.full_name AS guardian_name, g.relationship AS guardian_relationship, g.phone AS guardian_phone,
            date_part('year', age(clinic_local(now())::date, p.date_of_birth))::int AS age
     FROM patients p
     LEFT JOIN staff cb ON cb.id = p.created_by
     LEFT JOIN staff ub ON ub.id = p.updated_by
     ${PRIMARY_GUARDIAN}
     WHERE p.id = $1`,
    [id],
  );
  if (!patient) throw notFound('Không tìm thấy bệnh nhân');

  const [guardians, summary] = await Promise.all([
    query(
      `SELECT id, full_name, relationship, phone, is_primary, note, created_at
       FROM patient_guardians WHERE patient_id = $1 ORDER BY is_primary DESC, id`,
      [id],
    ),
    queryOne(
      `SELECT
         (SELECT coalesce(sum(balance_due), 0) FROM invoices
          WHERE patient_id = $1 AND status IN ('UNPAID', 'PARTIALLY_PAID')) AS total_debt,
         (SELECT count(*) FROM treatment_plans WHERE patient_id = $1 AND status = 'ACTIVE') AS active_plans,
         (SELECT last_visit_at FROM patients WHERE id = $1) AS last_visit_at,
         (SELECT json_build_object('appointment_id', a.id, 'start_at', a.start_at, 'doctor_name', d.full_name,
                                   'chair_name', c.name, 'service_name', s.name)
          FROM appointments a
          JOIN staff d ON d.id = a.doctor_id
          JOIN chairs c ON c.id = a.chair_id
          LEFT JOIN services s ON s.id = a.service_id
          WHERE a.patient_id = $1 AND a.status = 'BOOKED' AND a.start_at > now()
          ORDER BY a.start_at LIMIT 1) AS upcoming_appointment`,
      [id],
    ),
  ]);
  res.json({ ...patient, guardians, summary });
});

// BN-04: cập nhật thông tin (gồm chuyển trạng thái lưu trữ)
router.put('/:id', requirePerm('BN-04'), async (req, res) => {
  const user = currentUser(req);
  const id = idParam(req.params.id);
  const body = updateSchema.parse(req.body);
  await ensurePatient(id);

  const under15 = await checkDob(body.date_of_birth);
  if (under15) {
    const g = await queryOne<{ n: number }>('SELECT count(*) AS n FROM patient_guardians WHERE patient_id = $1', [id]);
    if (!g?.n) throw badRequest('Bệnh nhân dưới 15 tuổi phải có ít nhất một người giám hộ — hãy thêm người giám hộ trước');
  }

  const updated = await withTx(user.id, (db) =>
    queryOne(
      `UPDATE patients
       SET full_name = $2, date_of_birth = $3, gender = $4, phone = $5, email = $6, address = $7,
           medical_history = $8, note = $9,
           legacy_record_no = CASE WHEN is_legacy THEN $10 ELSE legacy_record_no END,
           status = $11::varchar,
           archived_at = CASE WHEN $11::varchar = 'ARCHIVED' THEN coalesce(archived_at, now()) END,
           updated_by = $12
       WHERE id = $1
       RETURNING id, patient_code, status`,
      [
        id,
        body.full_name,
        body.date_of_birth ?? null,
        body.gender ?? null,
        body.phone ?? null,
        body.email ?? null,
        body.address ?? null,
        body.medical_history ?? null,
        body.note ?? null,
        body.legacy_record_no ?? null,
        body.status,
        user.id,
      ],
      db,
    ),
  );
  res.json(updated);
});

/* ----------------------------- Người giám hộ ----------------------------- */

/** Còn người giám hộ mà không ai là giám hộ chính → đặt người đầu tiên làm chính */
async function ensurePrimaryGuardian(db: Queryable, patientId: number): Promise<void> {
  await db.query(
    `UPDATE patient_guardians SET is_primary = true
     WHERE id = (SELECT min(id) FROM patient_guardians WHERE patient_id = $1)
       AND NOT EXISTS (SELECT 1 FROM patient_guardians WHERE patient_id = $1 AND is_primary)`,
    [patientId],
  );
}

router.post('/:id/guardians', requirePerm('BN-03', 'BN-04'), async (req, res) => {
  const user = currentUser(req);
  const id = idParam(req.params.id);
  const g = guardianSchema.parse(req.body);
  await ensurePatient(id);
  const row = await withTx(user.id, async (db) => {
    const first = await queryOne<{ n: number }>('SELECT count(*) AS n FROM patient_guardians WHERE patient_id = $1', [id], db);
    const isPrimary = g.is_primary || !first?.n;
    if (isPrimary) await db.query('UPDATE patient_guardians SET is_primary = false WHERE patient_id = $1', [id]);
    return queryOne(
      `INSERT INTO patient_guardians (patient_id, full_name, relationship, phone, is_primary, note)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, g.full_name, g.relationship, g.phone, isPrimary, g.note ?? null],
      db,
    );
  });
  res.status(201).json(row);
});

router.put('/:id/guardians/:gid', requirePerm('BN-03', 'BN-04'), async (req, res) => {
  const user = currentUser(req);
  const id = idParam(req.params.id);
  const gid = idParam(req.params.gid);
  const g = guardianSchema.parse(req.body);
  const row = await withTx(user.id, async (db) => {
    // Kiểm tra tồn tại trước khi đụng tới cờ giám hộ chính của người khác
    const exists = await queryOne('SELECT 1 FROM patient_guardians WHERE id = $1 AND patient_id = $2 FOR UPDATE', [gid, id], db);
    if (!exists) throw notFound('Không tìm thấy người giám hộ');
    if (g.is_primary) {
      await db.query('UPDATE patient_guardians SET is_primary = false WHERE patient_id = $1 AND id <> $2', [id, gid]);
    }
    const updated = await queryOne(
      `UPDATE patient_guardians SET full_name = $3, relationship = $4, phone = $5, is_primary = $6, note = $7
       WHERE id = $2 AND patient_id = $1 RETURNING *`,
      [id, gid, g.full_name, g.relationship, g.phone, g.is_primary, g.note ?? null],
      db,
    );
    await ensurePrimaryGuardian(db, id);
    return updated;
  });
  res.json(row);
});

router.delete('/:id/guardians/:gid', requirePerm('BN-03', 'BN-04'), async (req, res) => {
  const user = currentUser(req);
  const id = idParam(req.params.id);
  const gid = idParam(req.params.gid);
  const patient = await ensurePatient(id);
  const under15 = await checkDob(patient.date_of_birth);
  await withTx(user.id, async (db) => {
    const removed = await queryOne<{ is_primary: boolean }>(
      'DELETE FROM patient_guardians WHERE id = $1 AND patient_id = $2 RETURNING is_primary',
      [gid, id],
      db,
    );
    if (!removed) throw notFound('Không tìm thấy người giám hộ');
    const left = await queryOne<{ n: number }>('SELECT count(*) AS n FROM patient_guardians WHERE patient_id = $1', [id], db);
    if (under15 && !left?.n) throw badRequest('Bệnh nhân dưới 15 tuổi phải còn ít nhất một người giám hộ');
    await ensurePrimaryGuardian(db, id);
  });
  res.json({ ok: true });
});

/* ------------------------------ Tab hồ sơ (BN-05) ------------------------------ */

router.get('/:id/appointments', requirePerm('BN-05'), async (req, res) => {
  const id = idParam(req.params.id);
  const rows = await query(
    `SELECT a.booking_group_id, min(a.id) AS appointment_id, min(a.start_at) AS start_at, max(a.end_at) AS end_at,
            count(*) AS slots, a.status, a.source, d.full_name AS doctor_name, c.name AS chair_name,
            s.name AS service_name, max(a.note) AS note, max(a.checked_in_at) AS checked_in_at,
            max(cr.name) AS cancel_reason, max(a.cancel_note) AS cancel_note, max(a.cancelled_at) AS cancelled_at
     FROM appointments a
     JOIN staff d ON d.id = a.doctor_id
     JOIN chairs c ON c.id = a.chair_id
     LEFT JOIN services s ON s.id = a.service_id
     LEFT JOIN cancel_reasons cr ON cr.id = a.cancel_reason_id
     WHERE a.patient_id = $1
     GROUP BY a.booking_group_id, a.status, a.source, d.full_name, c.name, s.name
     ORDER BY min(a.start_at) DESC`,
    [id],
  );
  res.json(rows);
});

router.get('/:id/treatments', requirePerm('BN-05'), async (req, res) => {
  const id = idParam(req.params.id);
  const rows = await query(
    `SELECT tr.id, tr.record_code, tr.visit_at, tr.status, tr.chief_complaint, tr.diagnosis, tr.note,
            d.full_name AS primary_doctor_name, c.name AS chair_name,
            tr.treatment_plan_id, tp.plan_code, tp.name AS plan_name, tr.plan_session_no,
            inv.id AS invoice_id, inv.invoice_code, inv.status AS invoice_status, inv.total_amount AS invoice_total,
            coalesce((
              SELECT json_agg(json_build_object(
                       'id', i.id, 'line_no', i.line_no, 'service_name', s.name, 'tooth_code', i.tooth_code,
                       'performing_doctor_name', pd.full_name, 'quantity', i.quantity,
                       'is_plan_package', i.is_plan_package, 'note', i.note) ORDER BY i.line_no)
              FROM treatment_record_items i
              JOIN services s ON s.id = i.service_id
              JOIN staff pd ON pd.id = i.performing_doctor_id
              WHERE i.treatment_record_id = tr.id), '[]') AS items,
            coalesce((
              SELECT json_agg(json_build_object(
                       'id', pi.id, 'medicine_name', pi.medicine_name, 'dosage', pi.dosage,
                       'quantity', pi.quantity, 'unit', pi.unit, 'is_external', pi.is_external) ORDER BY pi.id)
              FROM prescription_items pi WHERE pi.treatment_record_id = tr.id), '[]') AS prescriptions
     FROM treatment_records tr
     JOIN staff d ON d.id = tr.primary_doctor_id
     LEFT JOIN chairs c ON c.id = tr.chair_id
     LEFT JOIN treatment_plans tp ON tp.id = tr.treatment_plan_id
     LEFT JOIN LATERAL (
       SELECT id, invoice_code, status, total_amount FROM invoices
       WHERE treatment_record_id = tr.id ORDER BY (status = 'VOIDED'), id DESC LIMIT 1
     ) inv ON true
     WHERE tr.patient_id = $1
     ORDER BY tr.visit_at DESC`,
    [id],
  );
  res.json(rows);
});

router.get('/:id/plans', requirePerm('BN-05'), async (req, res) => {
  const id = idParam(req.params.id);
  const rows = await query(
    `SELECT tp.id, tp.plan_code, tp.name, tp.plan_type, tp.status, tp.total_price, tp.expected_sessions,
            tp.started_on, tp.ended_on, d.full_name AS doctor_name,
            (SELECT count(*) FROM treatment_records tr
             WHERE tr.treatment_plan_id = tp.id AND tr.status <> 'CANCELLED') AS completed_sessions,
            (SELECT coalesce(sum(i.paid_amount), 0) FROM invoices i
             WHERE i.treatment_plan_id = tp.id AND i.status <> 'VOIDED') AS paid_amount
     FROM treatment_plans tp
     JOIN staff d ON d.id = tp.primary_doctor_id
     WHERE tp.patient_id = $1
     ORDER BY tp.started_on DESC, tp.id DESC`,
    [id],
  );
  res.json(rows);
});

router.get('/:id/invoices', requirePerm('BN-05', 'TT-06'), async (req, res) => {
  const id = idParam(req.params.id);
  const rows = await query(
    `SELECT i.id, i.invoice_code, i.invoice_type, i.issued_at, i.status, i.subtotal, i.discount_amount,
            i.total_amount, i.paid_amount, i.balance_due, i.void_reason,
            tr.record_code, tp.plan_code, ib.full_name AS issued_by_name,
            coalesce((
              SELECT json_agg(json_build_object(
                       'id', p.id, 'receipt_code', p.receipt_code, 'amount', p.amount, 'method', p.method,
                       'paid_at', p.paid_at, 'received_by_name', s.full_name) ORDER BY p.paid_at)
              FROM payments p JOIN staff s ON s.id = p.received_by
              WHERE p.invoice_id = i.id), '[]') AS payments
     FROM invoices i
     JOIN staff ib ON ib.id = i.issued_by
     LEFT JOIN treatment_records tr ON tr.id = i.treatment_record_id
     LEFT JOIN treatment_plans tp ON tp.id = i.treatment_plan_id
     WHERE i.patient_id = $1
     ORDER BY i.issued_at DESC`,
    [id],
  );
  res.json(rows);
});

/* ------------------------------ Tài liệu (BN-06) ------------------------------ */

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new HttpError(400, 'Chỉ nhận file ảnh (JPG, PNG, WEBP, GIF) hoặc PDF'));
  },
});

function uploadSingle(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      next(badRequest(err.code === 'LIMIT_FILE_SIZE' ? 'File vượt quá 10MB' : `Lỗi tải file: ${err.message}`));
    } else {
      next(err as Error | undefined);
    }
  });
}

/** Multer giải mã tên file theo latin1 — chuyển lại UTF-8 cho tên tiếng Việt */
function decodeFileName(name: string): string {
  const utf8 = Buffer.from(name, 'latin1').toString('utf8');
  return utf8.includes('�') ? name : utf8;
}

function safeFileName(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return (base || 'file').slice(-100);
}

router.get('/:id/documents', requirePerm('BN-05'), async (req, res) => {
  const id = idParam(req.params.id);
  const rows = await query(
    `SELECT d.id, d.document_type, d.file_name, d.mime_type, d.file_size, d.description,
            d.uploaded_at, s.full_name AS uploaded_by_name
     FROM patient_documents d LEFT JOIN staff s ON s.id = d.uploaded_by
     WHERE d.patient_id = $1
     ORDER BY d.uploaded_at DESC`,
    [id],
  );
  res.json(rows);
});

router.post('/:id/documents', requirePerm('BN-06', 'BN-04'), uploadSingle, async (req, res) => {
  const user = currentUser(req);
  const id = idParam(req.params.id);
  const { document_type, description } = z
    .object({
      document_type: z.enum(['LEGACY_SCAN', 'XRAY', 'PHOTO', 'OTHER']).default('LEGACY_SCAN'),
      description: optionalText,
    })
    .parse(req.body);
  const file = req.file;
  if (!file) throw badRequest('Chưa chọn file');
  const patient = await ensurePatient(id);

  const originalName = decodeFileName(file.originalname);
  const relPath = path.posix.join('patients', patient.patient_code, `${Date.now()}-${safeFileName(originalName)}`);
  const absPath = path.join(config.uploadDir, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, file.buffer);

  try {
    const row = await withTx(user.id, (db) =>
      queryOne(
        `INSERT INTO patient_documents (patient_id, document_type, file_path, file_name, mime_type, file_size,
                                        description, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, document_type, file_name, mime_type, file_size, description, uploaded_at`,
        [id, document_type, relPath, originalName, file.mimetype, file.size, description ?? null, user.id],
        db,
      ),
    );
    res.status(201).json(row);
  } catch (err) {
    await fs.unlink(absPath).catch(() => undefined);
    throw err;
  }
});

router.get('/:id/documents/:docId/file', requirePerm('BN-01', 'BN-05'), async (req, res) => {
  const id = idParam(req.params.id);
  const docId = idParam(req.params.docId);
  const doc = await queryOne<{ file_path: string; file_name: string; mime_type: string | null }>(
    'SELECT file_path, file_name, mime_type FROM patient_documents WHERE id = $1 AND patient_id = $2',
    [docId, id],
  );
  if (!doc) throw notFound('Không tìm thấy tài liệu');

  const root = path.resolve(config.uploadDir);
  const absPath = path.resolve(root, doc.file_path);
  if (!absPath.startsWith(root + path.sep)) throw forbidden('Đường dẫn file không hợp lệ');
  try {
    await fs.access(absPath);
  } catch {
    throw notFound('File không còn trên máy chủ (dữ liệu mẫu chưa có file thật)');
  }
  res.setHeader('Content-Type', doc.mime_type ?? 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.file_name)}`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.sendFile(absPath);
});

export default router;
