// Quản trị: QT-01 … QT-05 (ca trực, bảng giá, danh mục, kho, tài khoản & phân quyền)
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { currentUser, requirePerm } from '../auth.js';
import { type Queryable, query, queryOne, withTx } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { dateStr, idParam, optionalText, shift, timeStr } from '../validate.js';

const router = Router();

const TODAY = 'clinic_local(now())::date';
const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);
const optionalId = z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional());
const optionalDate = z.preprocess(emptyToUndefined, dateStr.optional());
const positiveId = z.coerce.number().int().positive();

// Express 5 khai báo req.params là string | string[] khi path không phải literal
const routeId = (value: string | string[] | undefined) => idParam(Array.isArray(value) ? value[0] : value);

// =============================================================================
// QT-01: Ca trực bác sĩ
// =============================================================================

/** Số lịch hẹn chưa hủy nằm trong ca (alias ds = doctor_shifts) */
const SHIFT_APPOINTMENTS = `(SELECT count(*) FROM appointments a
   WHERE a.doctor_id = ds.doctor_id AND a.status <> 'CANCELLED'
     AND clinic_local(a.start_at) >= ds.work_date + ds.start_time
     AND clinic_local(a.start_at) <  ds.work_date + ds.end_time)`;

async function mondayOf(date: string | null | undefined): Promise<string> {
  const row = await queryOne<{ monday: string }>(
    `SELECT date_trunc('week', coalesce($1::date, ${TODAY})::timestamp)::date AS monday`,
    [date ?? null],
  );
  return row!.monday;
}

router.get('/shifts', requirePerm('QT-01'), async (req, res) => {
  const { week_start } = z.object({ week_start: optionalDate }).parse(req.query);
  const monday = await mondayOf(week_start);

  const [days, doctors, shifts] = await Promise.all([
    query<{ date: string }>(
      `SELECT d::date AS date FROM generate_series($1::date, $1::date + 6, interval '1 day') d`,
      [monday],
    ),
    query(
      `SELECT s.id, s.staff_code, s.full_name, s.is_part_time, s.is_active,
              (SELECT count(DISTINCT work_date) FROM doctor_shifts
               WHERE doctor_id = s.id AND work_date BETWEEN $1::date AND $1::date + 6) AS days_in_week,
              (SELECT count(*) FROM doctor_shifts
               WHERE doctor_id = s.id AND work_date BETWEEN $1::date AND $1::date + 6) AS shifts_in_week
       FROM staff s JOIN roles r ON r.id = s.role_id
       WHERE r.code = 'DOCTOR'
         AND (s.is_active OR EXISTS (SELECT 1 FROM doctor_shifts
                                     WHERE doctor_id = s.id AND work_date BETWEEN $1::date AND $1::date + 6))
       ORDER BY s.staff_code`,
      [monday],
    ),
    query(
      `SELECT ds.id, ds.doctor_id, ds.work_date, ds.shift,
              to_char(ds.start_time, 'HH24:MI') AS start_time, to_char(ds.end_time, 'HH24:MI') AS end_time,
              ds.note, ${SHIFT_APPOINTMENTS} AS appointment_count
       FROM doctor_shifts ds
       WHERE ds.work_date BETWEEN $1::date AND $1::date + 6
       ORDER BY ds.work_date, ds.shift`,
      [monday],
    ),
  ]);
  res.json({ week_start: monday, days: days.map((d) => d.date), doctors, shifts });
});

router.post('/shifts', requirePerm('QT-01'), async (req, res) => {
  const user = currentUser(req);
  const body = z
    .object({
      doctor_id: positiveId,
      work_date: dateStr,
      shift,
      start_time: timeStr.nullish(),
      end_time: timeStr.nullish(),
      note: optionalText,
    })
    .parse(req.body);

  const doctor = await queryOne(
    `SELECT 1 FROM staff s JOIN roles r ON r.id = s.role_id
     WHERE s.id = $1 AND r.code = 'DOCTOR' AND s.is_active`,
    [body.doctor_id],
  );
  if (!doctor) throw badRequest('Nhân viên không phải bác sĩ đang làm việc');

  // Giờ mặc định (giả định 2): sáng 8h–14h, chiều 14h–20h, Chủ nhật chiều 14h–17h
  const row = await withTx(user.id, (db) =>
    queryOne(
      `INSERT INTO doctor_shifts (doctor_id, work_date, shift, start_time, end_time, note, created_by)
       VALUES ($1, $2::date, $3::varchar,
               coalesce($4::time, CASE WHEN $3::varchar = 'MORNING' THEN time '08:00' ELSE time '14:00' END),
               coalesce($5::time, CASE WHEN $3::varchar = 'MORNING' THEN time '14:00'
                                       WHEN extract(isodow FROM $2::date) = 7 THEN time '17:00'
                                       ELSE time '20:00' END),
               $6, $7)
       RETURNING id`,
      [body.doctor_id, body.work_date, body.shift, body.start_time ?? null, body.end_time ?? null, body.note ?? null, user.id],
      db,
    ),
  );
  res.status(201).json(row);
});

router.delete('/shifts/:id', requirePerm('QT-01'), async (req, res) => {
  const user = currentUser(req);
  const id = routeId(req.params.id);
  await withTx(user.id, async (db) => {
    const ds = await queryOne<{ appointment_count: number }>(
      `SELECT ds.id, ${SHIFT_APPOINTMENTS} AS appointment_count FROM doctor_shifts ds WHERE ds.id = $1 FOR UPDATE`,
      [id],
      db,
    );
    if (!ds) throw notFound('Không tìm thấy ca trực');
    if (ds.appointment_count > 0) {
      throw conflict(`Ca này đang có ${ds.appointment_count} lịch hẹn — hãy đổi hoặc hủy lịch trước khi xóa ca`);
    }
    await db.query('DELETE FROM doctor_shifts WHERE id = $1', [id]);
  });
  res.json({ ok: true });
});

router.post('/shifts/copy-week', requirePerm('QT-01'), async (req, res) => {
  const user = currentUser(req);
  const body = z.object({ from_week_start: dateStr, to_week_start: dateStr }).parse(req.body);
  const [from, to] = await Promise.all([mondayOf(body.from_week_start), mondayOf(body.to_week_start)]);
  if (from === to) throw badRequest('Tuần nguồn và tuần đích trùng nhau');

  const result = await withTx(user.id, async (db) => {
    // Đếm ca nguồn (bác sĩ còn hoạt động) để UI phân biệt "tuần trước trống" với "tuần này đã đủ ca"
    const src = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n
       FROM doctor_shifts ds JOIN staff s ON s.id = ds.doctor_id AND s.is_active
       WHERE ds.work_date BETWEEN $1::date AND $1::date + 6`,
      [from],
      db,
    );
    const rows = await query(
      `INSERT INTO doctor_shifts (doctor_id, work_date, shift, start_time, end_time, note, created_by)
       SELECT ds.doctor_id, ds.work_date + ($2::date - $1::date), ds.shift, ds.start_time, ds.end_time, ds.note, $3
       FROM doctor_shifts ds JOIN staff s ON s.id = ds.doctor_id AND s.is_active
       WHERE ds.work_date BETWEEN $1::date AND $1::date + 6
       ON CONFLICT (doctor_id, work_date, shift) DO NOTHING
       RETURNING id`,
      [from, to, user.id],
      db,
    );
    return { created: rows.length, source_count: src?.n ?? 0 };
  });
  res.json(result);
});

// =============================================================================
// QT-02: Bảng giá (dịch vụ & thuốc) — tạo giá mới theo ngày hiệu lực, không ghi đè
// =============================================================================

const PRICE_KINDS = {
  services: {
    entity: 'services',
    table: 'service_prices',
    fk: 'service_id',
    extra: 'e.category, NULL::varchar AS item_type',
    order: 'e.category NULLS LAST, e.name',
  },
  items: {
    entity: 'items',
    table: 'item_prices',
    fk: 'item_id',
    extra: 'NULL::varchar AS category, e.item_type',
    order: 'e.item_type, e.name',
  },
} as const;

for (const [kind, k] of Object.entries(PRICE_KINDS)) {
  router.get(`/prices/${kind}`, requirePerm('QT-02'), async (_req, res) => {
    const rows = await query(
      `SELECT e.id, e.code, e.name, e.unit, e.is_active, ${k.extra},
              cur.price AS current_price, cur.effective_from AS current_from,
              nxt.id AS next_price_id, nxt.price AS next_price, nxt.effective_from AS next_from
       FROM ${k.entity} e
       LEFT JOIN LATERAL (
         SELECT price, effective_from FROM ${k.table}
         WHERE ${k.fk} = e.id AND effective_from <= ${TODAY}
         ORDER BY effective_from DESC LIMIT 1
       ) cur ON true
       LEFT JOIN LATERAL (
         SELECT id, price, effective_from FROM ${k.table}
         WHERE ${k.fk} = e.id AND effective_from > ${TODAY}
         ORDER BY effective_from LIMIT 1
       ) nxt ON true
       ORDER BY e.is_active DESC, ${k.order}`,
    );
    res.json(rows);
  });

  router.get(`/prices/${kind}/:id/history`, requirePerm('QT-02'), async (req, res) => {
    const id = routeId(req.params.id);
    const entity = await queryOne(`SELECT id, code, name, unit FROM ${k.entity} WHERE id = $1`, [id]);
    if (!entity) throw notFound();
    const prices = await query(
      `SELECT p.id, p.price, p.effective_from, p.note, p.created_at, st.full_name AS created_by_name,
              CASE WHEN p.effective_from > ${TODAY} THEN 'FUTURE'
                   WHEN p.effective_from = (SELECT max(effective_from) FROM ${k.table}
                                            WHERE ${k.fk} = $1 AND effective_from <= ${TODAY}) THEN 'CURRENT'
                   ELSE 'PAST' END AS state
       FROM ${k.table} p LEFT JOIN staff st ON st.id = p.created_by
       WHERE p.${k.fk} = $1
       ORDER BY p.effective_from DESC`,
      [id],
    );
    res.json({ entity, prices });
  });

  router.post(`/prices/${kind}`, requirePerm('QT-02'), async (req, res) => {
    const user = currentUser(req);
    const targetId = idParam(String(req.body?.[k.fk] ?? ''));
    const body = z
      .object({
        price: z.coerce.number().min(0, 'Giá không được âm'),
        effective_from: dateStr,
        note: optionalText,
      })
      .parse(req.body);

    const check = await queryOne<{ exists: boolean; past: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM ${k.entity} WHERE id = $1) AS exists, $2::date < ${TODAY} AS past`,
      [targetId, body.effective_from],
    );
    if (!check?.exists) throw notFound();
    if (check.past) throw badRequest('Ngày hiệu lực không được ở quá khứ — giá cũ được giữ nguyên để đối chiếu hóa đơn');

    const row = await withTx(user.id, (db) =>
      queryOne(
        `INSERT INTO ${k.table} (${k.fk}, price, effective_from, note, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [targetId, body.price, body.effective_from, body.note ?? null, user.id],
        db,
      ),
    );
    res.status(201).json(row);
  });

  // Chỉ sửa/xóa được giá chưa hiệu lực — trigger trg_prices_protect chặn giá đã hiệu lực
  router.put(`/prices/${kind}/:priceId`, requirePerm('QT-02'), async (req, res) => {
    const user = currentUser(req);
    const priceId = routeId(req.params.priceId);
    const body = z.object({ price: z.coerce.number().min(0, 'Giá không được âm'), note: optionalText }).parse(req.body);
    const row = await withTx(user.id, (db) =>
      queryOne(`UPDATE ${k.table} SET price = $1, note = $2 WHERE id = $3 RETURNING id`, [
        body.price,
        body.note ?? null,
        priceId,
      ], db),
    );
    if (!row) throw notFound('Không tìm thấy giá');
    res.json(row);
  });

  router.delete(`/prices/${kind}/:priceId`, requirePerm('QT-02'), async (req, res) => {
    const user = currentUser(req);
    const priceId = routeId(req.params.priceId);
    const row = await withTx(user.id, (db) =>
      queryOne(`DELETE FROM ${k.table} WHERE id = $1 RETURNING id`, [priceId], db),
    );
    if (!row) throw notFound('Không tìm thấy giá');
    res.json({ ok: true });
  });
}

// =============================================================================
// QT-03: Danh mục — không xóa cứng, chỉ bật/tắt is_active
// =============================================================================

async function assertUniqueCode(db: Queryable, table: string, code: string, excludeId: number | null) {
  const dup = await queryOne(
    `SELECT id FROM ${table} WHERE lower(code) = lower($1) AND ($2::bigint IS NULL OR id <> $2)`,
    [code, excludeId],
    db,
  );
  if (dup) throw conflict(`Mã "${code}" đã tồn tại`);
}

const codeField = z.string().trim().min(1, 'Nhập mã').max(30);
const nameField = z.string().trim().min(1, 'Nhập tên').max(200);

const serviceBody = z.object({
  code: codeField,
  name: nameField,
  category: optionalText,
  unit: z.string().trim().min(1, 'Nhập đơn vị').max(30),
  tooth_scope: z.enum(['TOOTH', 'JAW', 'ANY']),
  default_slots: z.coerce.number().int().min(1).max(12),
  description: optionalText,
});

const chairBody = z.object({ code: codeField.max(20), name: nameField.max(100), note: optionalText });

const itemBody = z.object({
  code: codeField,
  name: nameField,
  item_type: z.enum(['SUPPLY', 'MEDICINE']),
  unit: z.string().trim().min(1, 'Nhập đơn vị').max(30),
  min_stock: z.coerce.number().min(0, 'Ngưỡng tối thiểu không được âm'),
  default_dosage: optionalText,
  note: optionalText,
});

const cancelReasonBody = z.object({
  code: codeField,
  name: nameField.max(150),
  is_no_show: z.boolean().default(false),
  sort_order: z.coerce.number().int().default(0),
});

interface CatalogDef {
  table: string;
  schema: z.ZodObject<z.ZodRawShape>;
  columns: string[];
  list: string;
}

const CATALOG: Record<string, CatalogDef> = {
  services: {
    table: 'services',
    schema: serviceBody,
    columns: ['code', 'name', 'category', 'unit', 'tooth_scope', 'default_slots', 'description'],
    list: `SELECT s.*, (SELECT count(*) FROM service_material_norms n WHERE n.service_id = s.id) AS norm_count
           FROM services s ORDER BY s.is_active DESC, s.category NULLS LAST, s.name`,
  },
  chairs: {
    table: 'chairs',
    schema: chairBody,
    columns: ['code', 'name', 'note'],
    list: `SELECT c.*, (SELECT count(*) FROM appointments a
                        WHERE a.chair_id = c.id AND a.status IN ('BOOKED', 'ARRIVED') AND a.start_at >= now())
                       AS upcoming_appointments
           FROM chairs c ORDER BY c.code`,
  },
  items: {
    table: 'items',
    schema: itemBody,
    columns: ['code', 'name', 'item_type', 'unit', 'min_stock', 'default_dosage', 'note'],
    list: `SELECT i.*, (SELECT count(*) FROM service_material_norms n WHERE n.item_id = i.id) AS norm_count
           FROM items i ORDER BY i.is_active DESC, i.item_type, i.name`,
  },
  'cancel-reasons': {
    table: 'cancel_reasons',
    schema: cancelReasonBody,
    columns: ['code', 'name', 'is_no_show', 'sort_order'],
    list: 'SELECT * FROM cancel_reasons ORDER BY is_active DESC, sort_order, name',
  },
};

for (const [path, def] of Object.entries(CATALOG)) {
  router.get(`/catalog/${path}`, requirePerm('QT-03'), async (_req, res) => {
    res.json(await query(def.list));
  });

  router.post(`/catalog/${path}`, requirePerm('QT-03'), async (req, res) => {
    const user = currentUser(req);
    const body = def.schema.parse(req.body) as Record<string, unknown>;
    const values = def.columns.map((c) => body[c] ?? null);
    const row = await withTx(user.id, async (db) => {
      await assertUniqueCode(db, def.table, String(body.code), null);
      return queryOne(
        `INSERT INTO ${def.table} (${def.columns.join(', ')})
         VALUES (${def.columns.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
        values,
        db,
      );
    });
    res.status(201).json(row);
  });

  router.put(`/catalog/${path}/:id`, requirePerm('QT-03'), async (req, res) => {
    const user = currentUser(req);
    const id = routeId(req.params.id);
    const body = def.schema.parse(req.body) as Record<string, unknown>;
    const values = def.columns.map((c) => body[c] ?? null);
    const row = await withTx(user.id, async (db) => {
      await assertUniqueCode(db, def.table, String(body.code), id);
      return queryOne(
        `UPDATE ${def.table} SET ${def.columns.map((c, i) => `${c} = $${i + 1}`).join(', ')}
         WHERE id = $${def.columns.length + 1} RETURNING id`,
        [...values, id],
        db,
      );
    });
    if (!row) throw notFound();
    res.json(row);
  });

  router.patch(`/catalog/${path}/:id/active`, requirePerm('QT-03'), async (req, res) => {
    const user = currentUser(req);
    const id = routeId(req.params.id);
    const { is_active } = z.object({ is_active: z.boolean() }).parse(req.body);
    if (def.table === 'chairs' && !is_active) {
      const busy = await queryOne<{ count: number }>(
        `SELECT count(*) AS count FROM appointments
         WHERE chair_id = $1 AND status IN ('BOOKED', 'ARRIVED') AND start_at >= now()`,
        [id],
      );
      if (busy && busy.count > 0) {
        throw conflict(`Ghế còn ${busy.count} lịch hẹn sắp tới — chuyển lịch sang ghế khác trước khi ngừng sử dụng`);
      }
    }
    const row = await withTx(user.id, (db) =>
      queryOne(`UPDATE ${def.table} SET is_active = $1 WHERE id = $2 RETURNING id`, [is_active, id], db),
    );
    if (!row) throw notFound();
    res.json({ ok: true });
  });
}

// Định mức vật tư cho 1 đơn vị dịch vụ (DT-06 dùng khi lưu phiếu)
router.get('/catalog/services/:id/norms', requirePerm('QT-03'), async (req, res) => {
  const id = routeId(req.params.id);
  const service = await queryOne('SELECT id, code, name, unit FROM services WHERE id = $1', [id]);
  if (!service) throw notFound('Không tìm thấy dịch vụ');
  const norms = await query(
    `SELECT n.item_id, i.code, i.name, i.unit, i.item_type, i.is_active, n.quantity
     FROM service_material_norms n JOIN items i ON i.id = n.item_id
     WHERE n.service_id = $1 ORDER BY i.name`,
    [id],
  );
  res.json({ service, norms });
});

router.put('/catalog/services/:id/norms', requirePerm('QT-03'), async (req, res) => {
  const user = currentUser(req);
  const id = routeId(req.params.id);
  const { lines } = z
    .object({
      lines: z.array(
        z.object({ item_id: positiveId, quantity: z.coerce.number().positive('Định mức phải lớn hơn 0') }),
      ),
    })
    .parse(req.body);
  if (new Set(lines.map((l) => l.item_id)).size !== lines.length) {
    throw badRequest('Một vật tư chỉ được khai báo một lần trong định mức');
  }
  await withTx(user.id, async (db) => {
    const service = await queryOne('SELECT id FROM services WHERE id = $1 FOR UPDATE', [id], db);
    if (!service) throw notFound('Không tìm thấy dịch vụ');
    await db.query('DELETE FROM service_material_norms WHERE service_id = $1', [id]);
    if (lines.length) {
      await db.query(
        `INSERT INTO service_material_norms (service_id, item_id, quantity)
         SELECT $1, x.item_id, x.quantity FROM unnest($2::bigint[], $3::numeric[]) AS x (item_id, quantity)`,
        [id, lines.map((l) => l.item_id), lines.map((l) => l.quantity)],
      );
    }
  });
  res.json({ ok: true, count: lines.length });
});

// =============================================================================
// QT-04: Kho vật tư & thuốc — sổ kho chỉ ghi thêm, tồn kho do trigger cập nhật
// =============================================================================

router.get('/inventory', requirePerm('QT-04'), async (_req, res) => {
  const rows = await query(
    `SELECT i.id, i.code, i.name, i.item_type, i.unit, i.current_stock, i.min_stock, i.is_active,
            i.current_stock <= i.min_stock AS low_stock,
            i.current_stock < i.min_stock AS below_threshold,
            (SELECT max(created_at) FROM stock_movements
             WHERE item_id = i.id AND movement_type = 'IMPORT') AS last_import_at,
            (SELECT ip.price FROM item_prices ip
             WHERE ip.item_id = i.id AND ip.effective_from <= ${TODAY}
             ORDER BY ip.effective_from DESC LIMIT 1) AS current_price
     FROM items i
     ORDER BY i.is_active DESC, (i.current_stock <= i.min_stock) DESC, i.item_type, i.name`,
  );
  res.json(rows);
});

router.post('/inventory/import', requirePerm('QT-04'), async (req, res) => {
  const user = currentUser(req);
  const { lines, note } = z
    .object({
      lines: z
        .array(
          z.object({
            item_id: positiveId,
            quantity: z.coerce.number().positive('Số lượng nhập phải lớn hơn 0'),
            unit_cost: z.preprocess(emptyToUndefined, z.coerce.number().min(0).nullish()),
            supplier: optionalText,
            batch_no: optionalText,
            expiry_date: z.preprocess(emptyToUndefined, dateStr.nullish()),
          }),
        )
        .min(1, 'Phiếu nhập phải có ít nhất 1 dòng'),
      note: optionalText,
    })
    .parse(req.body);

  const rows = await withTx(user.id, async (db) => {
    const created = [];
    for (const l of lines) {
      created.push(
        await queryOne(
          `INSERT INTO stock_movements (item_id, movement_type, quantity, unit_cost, supplier, batch_no,
                                        expiry_date, note, created_by)
           VALUES ($1, 'IMPORT', $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [l.item_id, l.quantity, l.unit_cost ?? null, l.supplier ?? null, l.batch_no ?? null,
           l.expiry_date ?? null, note ?? 'Nhập kho', user.id],
          db,
        ),
      );
    }
    return created;
  });
  res.status(201).json({ created: rows.length });
});

router.post('/inventory/stock-take', requirePerm('QT-04'), async (req, res) => {
  const user = currentUser(req);
  const { lines, note } = z
    .object({
      lines: z
        .array(z.object({ item_id: positiveId, counted_quantity: z.coerce.number().min(0, 'Số đếm không được âm') }))
        .min(1, 'Chưa nhập số kiểm kê'),
      note: optionalText,
    })
    .parse(req.body);
  const ids = lines.map((l) => l.item_id);
  if (new Set(ids).size !== ids.length) throw badRequest('Mỗi mặt hàng chỉ nhập một số kiểm kê');

  const adjustments = await withTx(user.id, async (db) => {
    const locked = await query('SELECT id FROM items WHERE id = ANY($1::bigint[]) FOR UPDATE', [ids], db);
    if (locked.length !== ids.length) throw notFound('Có mặt hàng không tồn tại');
    const result = [];
    for (const l of lines) {
      const row = await queryOne(
        `INSERT INTO stock_movements (item_id, movement_type, quantity, note, created_by)
         SELECT i.id, 'STOCK_TAKE', $2::numeric - i.current_stock,
                format('Kiểm kê: hệ thống %s, thực tế %s %s', fmt_qty(i.current_stock), fmt_qty($2::numeric), i.unit)
                  || coalesce(' — ' || $3::text, ''),
                $4
         FROM items i WHERE i.id = $1 AND i.current_stock <> $2::numeric
         RETURNING item_id, quantity`,
        [l.item_id, l.counted_quantity, note ?? null, user.id],
        db,
      );
      if (row) result.push(row);
    }
    return result;
  });
  res.json({ adjusted: adjustments.length, adjustments });
});

router.post('/inventory/adjust', requirePerm('QT-04'), async (req, res) => {
  const user = currentUser(req);
  const body = z
    .object({
      item_id: positiveId,
      quantity: z.coerce.number().refine((v) => v !== 0, 'Số lượng điều chỉnh phải khác 0'),
      note: z.string().trim().min(1, 'Phải ghi lý do điều chỉnh'),
    })
    .parse(req.body);
  const row = await withTx(user.id, (db) =>
    queryOne(
      `INSERT INTO stock_movements (item_id, movement_type, quantity, note, created_by)
       SELECT id, 'ADJUSTMENT', $2, $3, $4 FROM items WHERE id = $1 RETURNING id`,
      [body.item_id, body.quantity, body.note, user.id],
      db,
    ),
  );
  if (!row) throw notFound('Không tìm thấy mặt hàng');
  res.status(201).json(row);
});

router.get('/inventory/movements', requirePerm('QT-04'), async (req, res) => {
  const PAGE_SIZE = 50;
  const f = z
    .object({
      item_id: optionalId,
      movement_type: z.preprocess(
        emptyToUndefined,
        z.enum(['IMPORT', 'TREATMENT_USE', 'DISPENSE', 'STOCK_TAKE', 'ADJUSTMENT']).optional(),
      ),
      date_from: optionalDate,
      date_to: optionalDate,
      page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).default(1)),
    })
    .parse(req.query);

  const rows = await query<Record<string, unknown> & { total: number }>(
    `SELECT sm.id, sm.item_id, i.code AS item_code, i.name AS item_name, i.unit, i.item_type,
            sm.movement_type, sm.quantity, sm.unit_cost, sm.supplier, sm.batch_no, sm.expiry_date, sm.note,
            sm.treatment_record_id, tr.record_code, st.full_name AS created_by_name, sm.created_at,
            count(*) OVER () AS total
     FROM stock_movements sm
     JOIN items i ON i.id = sm.item_id
     LEFT JOIN treatment_records tr ON tr.id = sm.treatment_record_id
     LEFT JOIN staff st ON st.id = sm.created_by
     WHERE ($1::bigint IS NULL OR sm.item_id = $1)
       AND ($2::varchar IS NULL OR sm.movement_type = $2)
       AND ($3::date IS NULL OR clinic_local(sm.created_at)::date >= $3)
       AND ($4::date IS NULL OR clinic_local(sm.created_at)::date <= $4)
     ORDER BY sm.created_at DESC, sm.id DESC
     LIMIT ${PAGE_SIZE} OFFSET $5`,
    [f.item_id ?? null, f.movement_type ?? null, f.date_from ?? null, f.date_to ?? null, (f.page - 1) * PAGE_SIZE],
  );
  res.json({
    rows: rows.map(({ total: _total, ...r }) => r),
    total: rows[0]?.total ?? 0,
    page: f.page,
    page_size: PAGE_SIZE,
  });
});

// =============================================================================
// QT-05: Tài khoản & phân quyền
// =============================================================================

const staffFields = {
  staff_code: z.string().trim().min(1, 'Nhập mã nhân viên').max(20),
  full_name: z.string().trim().min(1, 'Nhập họ tên').max(150),
  phone: optionalText,
  email: z.preprocess(emptyToUndefined, z.string().trim().email('Email không hợp lệ').nullish()),
  username: z
    .string()
    .trim()
    .min(3, 'Tên đăng nhập tối thiểu 3 ký tự')
    .max(50)
    .regex(/^[A-Za-z0-9._-]+$/, 'Tên đăng nhập chỉ gồm chữ không dấu, số, dấu chấm, gạch'),
  role_id: positiveId,
  is_part_time: z.boolean().default(false),
};
const newPassword = z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự');

async function assertStaffUnique(db: Queryable, staffCode: string, username: string, excludeId: number | null) {
  const dup = await queryOne<{ field: string }>(
    `SELECT CASE WHEN lower(staff_code) = lower($1) THEN 'code' ELSE 'username' END AS field
     FROM staff
     WHERE (lower(staff_code) = lower($1) OR lower(username) = lower($2)) AND ($3::bigint IS NULL OR id <> $3)
     LIMIT 1`,
    [staffCode, username, excludeId],
    db,
  );
  if (dup) throw conflict(dup.field === 'code' ? 'Mã nhân viên đã tồn tại' : 'Tên đăng nhập đã tồn tại');
}

router.get('/staff', requirePerm('QT-05'), async (_req, res) => {
  const rows = await query(
    `SELECT s.id, s.staff_code, s.full_name, s.phone, s.email, s.username, s.role_id, r.code AS role,
            r.name AS role_name, s.is_part_time, s.is_active, s.must_change_password, s.last_login_at, s.created_at
     FROM staff s JOIN roles r ON r.id = s.role_id
     ORDER BY s.is_active DESC, s.staff_code`,
  );
  res.json(rows);
});

router.post('/staff', requirePerm('QT-05'), async (req, res) => {
  const user = currentUser(req);
  const body = z.object({ ...staffFields, password: newPassword }).parse(req.body);
  const hash = await bcrypt.hash(body.password, 10);
  const row = await withTx(user.id, async (db) => {
    await assertStaffUnique(db, body.staff_code, body.username, null);
    return queryOne(
      `INSERT INTO staff (role_id, staff_code, full_name, phone, email, username, password_hash,
                          must_change_password, is_part_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8) RETURNING id`,
      [body.role_id, body.staff_code, body.full_name, body.phone ?? null, body.email ?? null, body.username, hash,
       body.is_part_time],
      db,
    );
  });
  res.status(201).json(row);
});

router.put('/staff/:id', requirePerm('QT-05'), async (req, res) => {
  const user = currentUser(req);
  const id = routeId(req.params.id);
  const body = z.object({ ...staffFields, is_active: z.boolean().default(true) }).parse(req.body);

  await withTx(user.id, async (db) => {
    const existing = await queryOne<{ role_id: number; is_active: boolean; role: string }>(
      `SELECT s.role_id, s.is_active, r.code AS role FROM staff s JOIN roles r ON r.id = s.role_id
       WHERE s.id = $1 FOR UPDATE OF s`,
      [id],
      db,
    );
    if (!existing) throw notFound('Không tìm thấy nhân viên');
    if (id === user.id && (!body.is_active || body.role_id !== existing.role_id)) {
      throw forbidden('Không thể tự khóa tài khoản hoặc tự đổi vai trò của chính mình');
    }
    // Bác sĩ còn lịch hẹn sắp tới thì không khóa / đổi vai trò được (lịch phải gắn bác sĩ đang làm việc)
    if (existing.role === 'DOCTOR' && (!body.is_active || body.role_id !== existing.role_id)) {
      const busy = await queryOne<{ count: number }>(
        `SELECT count(*) AS count FROM appointments
         WHERE doctor_id = $1 AND status IN ('BOOKED', 'ARRIVED') AND start_at >= now()`,
        [id],
        db,
      );
      if (busy && busy.count > 0) {
        throw conflict(`Bác sĩ còn ${busy.count} lịch hẹn sắp tới — chuyển lịch cho bác sĩ khác trước`);
      }
    }
    await assertStaffUnique(db, body.staff_code, body.username, id);
    await db.query(
      `UPDATE staff SET staff_code = $1, full_name = $2, phone = $3, email = $4, username = $5, role_id = $6,
                        is_part_time = $7, is_active = $8
       WHERE id = $9`,
      [body.staff_code, body.full_name, body.phone ?? null, body.email ?? null, body.username, body.role_id,
       body.is_part_time, body.is_active, id],
    );
  });
  res.json({ ok: true });
});

router.post('/staff/:id/reset-password', requirePerm('QT-05'), async (req, res) => {
  const user = currentUser(req);
  const id = routeId(req.params.id);
  const { new_password } = z.object({ new_password: newPassword }).parse(req.body);
  const hash = await bcrypt.hash(new_password, 10);
  const row = await withTx(user.id, (db) =>
    queryOne('UPDATE staff SET password_hash = $1, must_change_password = true WHERE id = $2 RETURNING id', [hash, id], db),
  );
  if (!row) throw notFound('Không tìm thấy nhân viên');
  res.json({ ok: true });
});

router.get('/roles', requirePerm('QT-05'), async (_req, res) => {
  const [roles, permissions, direct, effective] = await Promise.all([
    query(
      `SELECT r.id, r.code, r.name, r.description, r.parent_role_id, p.code AS parent_code, p.name AS parent_name,
              (SELECT count(*) FROM staff s WHERE s.role_id = r.id AND s.is_active) AS staff_count
       FROM roles r LEFT JOIN roles p ON p.id = r.parent_role_id ORDER BY r.id`,
    ),
    query('SELECT id, code, module, name FROM permissions ORDER BY id'),
    query(
      `SELECT rp.role_id, p.code AS permission_code
       FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id ORDER BY rp.role_id, p.id`,
    ),
    query('SELECT role_id, permission_code FROM v_role_effective_permissions ORDER BY role_id, permission_code'),
  ]);
  res.json({ roles, permissions, direct, effective });
});

router.put('/roles/:id/permissions', requirePerm('QT-05'), async (req, res) => {
  const user = currentUser(req);
  const roleId = routeId(req.params.id);
  const { permission_codes } = z.object({ permission_codes: z.array(z.string().trim().min(1)) }).parse(req.body);
  const codes = [...new Set(permission_codes)];

  await withTx(user.id, async (db) => {
    const role = await queryOne<{ code: string; parent_role_id: number | null }>(
      'SELECT code, parent_role_id FROM roles WHERE id = $1 FOR UPDATE',
      [roleId],
      db,
    );
    if (!role) throw notFound('Không tìm thấy vai trò');
    const known = await query<{ code: string }>('SELECT code FROM permissions WHERE code = ANY($1::text[])', [codes], db);
    if (known.length !== codes.length) throw badRequest('Có mã quyền không tồn tại');

    await db.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
    if (codes.length) {
      await db.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT $1, id FROM permissions WHERE code = ANY($2::text[])`,
        [roleId, codes],
      );
    }
    // Không để Quản lý tự mất quyền quản trị tài khoản (khóa ngoài hệ thống)
    if (role.code === 'MANAGER') {
      const keep = await queryOne(
        `SELECT 1 FROM v_role_effective_permissions WHERE role_id = $1 AND permission_code = 'QT-05'`,
        [roleId],
        db,
      );
      if (!keep) throw badRequest('Vai trò Quản lý phải giữ quyền QT-05 (Quản lý tài khoản & phân quyền)');
    }
  });
  res.json({ ok: true, count: codes.length });
});

export default router;
