// Lịch hẹn: LH-01 … LH-09 (lịch & khung trống, đặt/đổi/hủy, nhắc lịch, tiếp đón, vãng lai)
import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requirePerm } from '../auth';
import { type Queryable, query, queryOne, withTx } from '../db';
import { badRequest, conflict, HttpError, notFound } from '../errors';
import { messageGateway } from '../services/smsGateway';
import { dateStr, optionalText, timeStr } from '../validate';

const router = Router();

const TZ = 'Asia/Ho_Chi_Minh';
const slotCount = z.coerce.number().int().min(1, 'Tối thiểu 1 khung').max(12, 'Tối đa 12 khung (6 giờ)');
const groupIdParam = (value: unknown) => z.uuid('Mã lịch hẹn không hợp lệ').parse(value);

/**
 * Nhóm lịch hẹn (các khung 30' cùng booking_group_id) — mỗi nhóm một dòng.
 * `where` lọc trên bảng appointments alias x (để gom nhóm), `params` dùng $1…
 */
function groupsSql(where: string): string {
  return `
    WITH g AS (
      SELECT booking_group_id, min(start_at) AS start_at, max(end_at) AS end_at,
             count(*)::int AS slots, min(id) AS appointment_id
      FROM appointments x
      WHERE ${where}
      GROUP BY booking_group_id
    )
    SELECT g.booking_group_id, g.appointment_id, g.start_at, g.end_at, g.slots,
           to_char(clinic_local(g.start_at), 'YYYY-MM-DD') AS date,
           to_char(clinic_local(g.start_at), 'HH24:MI') AS start_time,
           to_char(clinic_local(g.end_at), 'HH24:MI') AS end_time,
           a.status, a.source, a.note, a.checked_in_at,
           a.patient_id, p.patient_code, p.full_name AS patient_name, p.date_of_birth, p.phone AS patient_phone,
           a.doctor_id, d.full_name AS doctor_name, a.chair_id, c.name AS chair_name,
           a.service_id, s.name AS service_name,
           a.cancel_reason_id, cr.name AS cancel_reason_name, cr.is_no_show, a.cancel_note, a.cancelled_at,
           cb.full_name AS cancelled_by_name, cre.full_name AS created_by_name, a.created_at
    FROM g
    JOIN appointments a ON a.id = g.appointment_id
    JOIN patients p ON p.id = a.patient_id
    JOIN staff d ON d.id = a.doctor_id
    JOIN chairs c ON c.id = a.chair_id
    LEFT JOIN services s ON s.id = a.service_id
    LEFT JOIN cancel_reasons cr ON cr.id = a.cancel_reason_id
    LEFT JOIN staff cb ON cb.id = a.cancelled_by
    LEFT JOIN staff cre ON cre.id = a.created_by`;
}

interface SlotRow {
  doctor_id: number;
  doctor_name: string;
  start_time: string;
  free_chair_ids: number[];
}

/**
 * LH-01 / LH-07: các giờ bắt đầu còn trống cho `slots` khung 30' liên tiếp.
 * Điều kiện: mọi khung nằm trong ca trực của bác sĩ (có thể nối ca sáng–chiều), bác sĩ rảnh,
 * có ít nhất một ghế rảnh suốt khoảng thời gian. Hôm nay chỉ lấy giờ chưa qua
 * (roundDownNow = true: tính từ đầu khung 30' hiện tại — dùng cho khách vãng lai).
 */
async function findFreeSlots(
  opts: { date: string; doctorId: number | null; slots: number; excludeGroup: string | null; roundDownNow: boolean },
  db?: Queryable,
): Promise<SlotRow[]> {
  return query<SlotRow>(
    `WITH shift_slots AS (
       SELECT DISTINCT ds.doctor_id, gs::timestamp AS slot_local
       FROM doctor_shifts ds
       CROSS JOIN LATERAL generate_series(ds.work_date + ds.start_time,
                                          ds.work_date + ds.end_time - interval '30 minutes',
                                          interval '30 minutes') gs
       WHERE ds.work_date = $1::date AND ($2::bigint IS NULL OR ds.doctor_id = $2::bigint)
     ),
     threshold AS (
       SELECT CASE
                WHEN $1::date > clinic_local(now())::date THEN '-infinity'::timestamp
                WHEN $1::date < clinic_local(now())::date THEN 'infinity'::timestamp
                WHEN $5::boolean THEN date_trunc('hour', clinic_local(now()))
                     + floor(extract(minute FROM clinic_local(now())) / 30) * interval '30 minutes'
                ELSE clinic_local(now())
              END AS t
     ),
     busy AS (
       SELECT doctor_id, chair_id, tstzrange(start_at, end_at) AS r
       FROM appointments
       WHERE status <> 'CANCELLED'
         AND clinic_local(start_at)::date = $1::date
         AND ($4::uuid IS NULL OR booking_group_id <> $4::uuid)
     ),
     starts AS (
       SELECT s.doctor_id, s.slot_local AS start_local,
              (s.slot_local AT TIME ZONE '${TZ}') AS s_tz,
              ((s.slot_local + $3::int * interval '30 minutes') AT TIME ZONE '${TZ}') AS e_tz
       FROM shift_slots s, threshold th
       WHERE s.slot_local >= th.t
         AND (SELECT count(*) FROM shift_slots s2
              WHERE s2.doctor_id = s.doctor_id
                AND s2.slot_local >= s.slot_local
                AND s2.slot_local < s.slot_local + $3::int * interval '30 minutes') = $3::int
     )
     SELECT st.doctor_id, d.full_name AS doctor_name, to_char(st.start_local, 'HH24:MI') AS start_time,
            array_agg(c.id ORDER BY c.code) AS free_chair_ids
     FROM starts st
     JOIN staff d ON d.id = st.doctor_id AND d.is_active
     JOIN chairs c ON c.is_active
          AND NOT EXISTS (SELECT 1 FROM busy b WHERE b.chair_id = c.id AND b.r && tstzrange(st.s_tz, st.e_tz))
     WHERE NOT EXISTS (SELECT 1 FROM busy b WHERE b.doctor_id = st.doctor_id AND b.r && tstzrange(st.s_tz, st.e_tz))
     GROUP BY st.doctor_id, d.full_name, d.staff_code, st.start_local
     ORDER BY d.staff_code, st.start_local`,
    [opts.date, opts.doctorId, opts.slots, opts.excludeGroup, opts.roundDownNow],
    db,
  );
}

interface GroupSlot {
  id: number;
  status: string;
  patient_id: number;
  date: string;
  is_today: boolean;
  start_at: Date;
}

async function loadGroupSlots(groupId: string, db?: Queryable): Promise<GroupSlot[]> {
  const rows = await query<GroupSlot>(
    `SELECT id, status, patient_id, to_char(clinic_local(start_at), 'YYYY-MM-DD') AS date,
            clinic_local(start_at)::date = clinic_local(now())::date AS is_today, start_at
     FROM appointments WHERE booking_group_id = $1::uuid
     ORDER BY start_at
     ${db ? 'FOR UPDATE' : ''}`,
    [groupId],
    db,
  );
  if (!rows.length) throw notFound('Không tìm thấy lịch hẹn');
  return rows;
}

async function ensurePatient(db: Queryable, patientId: number): Promise<void> {
  const p = await queryOne('SELECT id FROM patients WHERE id = $1', [patientId], db);
  if (!p) throw badRequest('Bệnh nhân không tồn tại');
}

async function defaultSlots(db: Queryable, serviceId: number | null | undefined): Promise<number> {
  if (!serviceId) return 1;
  const s = await queryOne<{ default_slots: number }>('SELECT default_slots FROM services WHERE id = $1', [serviceId], db);
  if (!s) throw badRequest('Dịch vụ không tồn tại');
  return s.default_slots;
}

/** Thêm `slots` khung liên tiếp cùng một booking_group_id, trả về id nhóm */
async function insertGroup(
  db: Queryable,
  a: {
    patientId: number;
    doctorId: number;
    chairId: number;
    serviceId: number | null;
    date: string;
    startTime: string;
    slots: number;
    status: 'BOOKED' | 'ARRIVED';
    source: 'RECEPTION' | 'DOCTOR_FOLLOW_UP' | 'WALK_IN';
    note: string | null;
    staffId: number;
  },
): Promise<string> {
  const row = await queryOne<{ booking_group_id: string }>(
    `WITH grp AS (SELECT gen_random_uuid() AS id),
     ins AS (
       INSERT INTO appointments (booking_group_id, patient_id, doctor_id, chair_id, service_id, start_at, end_at,
                                 status, source, note, checked_in_at, created_by, updated_by)
       SELECT grp.id, $1, $2, $3, $4,
              ($5::date + $6::time + i * interval '30 minutes') AT TIME ZONE '${TZ}',
              ($5::date + $6::time + (i + 1) * interval '30 minutes') AT TIME ZONE '${TZ}',
              $8::varchar, $9, $10, CASE WHEN $8::varchar = 'ARRIVED' THEN now() END, $11, $11
       FROM grp, generate_series(0, $7::int - 1) AS i
       RETURNING booking_group_id
     )
     SELECT DISTINCT booking_group_id FROM ins`,
    [a.patientId, a.doctorId, a.chairId, a.serviceId, a.date, a.startTime, a.slots, a.status, a.source, a.note, a.staffId],
    db,
  );
  return row!.booking_group_id;
}

/* ------------------------------ LH-01: xem lịch ------------------------------ */

router.get('/', requirePerm('LH-01'), async (req, res) => {
  const q = z
    .object({
      date: dateStr.optional(),
      doctor_id: z.coerce.number().int().positive().optional(),
      chair_id: z.coerce.number().int().positive().optional(),
    })
    .parse(req.query);
  const date = q.date ?? (await queryOne<{ d: string }>("SELECT to_char(clinic_local(now()), 'YYYY-MM-DD') AS d"))!.d;

  const [groups, shifts, chairs] = await Promise.all([
    query(
      `${groupsSql('clinic_local(x.start_at)::date = $1::date')}
       WHERE ($2::bigint IS NULL OR a.doctor_id = $2) AND ($3::int IS NULL OR a.chair_id = $3)
       ORDER BY g.start_at, c.code`,
      [date, q.doctor_id ?? null, q.chair_id ?? null],
    ),
    query(
      `SELECT ds.id, ds.doctor_id, s.full_name AS doctor_name, ds.shift,
              to_char(ds.start_time, 'HH24:MI') AS start_time, to_char(ds.end_time, 'HH24:MI') AS end_time
       FROM doctor_shifts ds JOIN staff s ON s.id = ds.doctor_id
       WHERE ds.work_date = $1::date
       ORDER BY ds.shift, s.staff_code`,
      [date],
    ),
    query('SELECT id, code, name FROM chairs WHERE is_active ORDER BY code'),
  ]);
  res.json({ date, groups, shifts, chairs });
});

router.get('/slots', requirePerm('LH-01', 'LH-02'), async (req, res) => {
  const q = z
    .object({
      date: dateStr,
      doctor_id: z.coerce.number().int().positive().optional(),
      slots: slotCount.default(1),
      exclude_group: z.uuid().optional(),
    })
    .parse(req.query);
  const rows = await findFreeSlots({
    date: q.date,
    doctorId: q.doctor_id ?? null,
    slots: q.slots,
    excludeGroup: q.exclude_group ?? null,
    roundDownNow: false,
  });
  res.json(rows);
});

/* ------------------------------ LH-02: đặt lịch ------------------------------ */

const createSchema = z.object({
  patient_id: z.coerce.number().int().positive(),
  doctor_id: z.coerce.number().int().positive(),
  chair_id: z.coerce.number().int().positive(),
  service_id: z.coerce.number().int().positive().nullish(),
  date: dateStr,
  start_time: timeStr,
  slots: slotCount.optional(),
  note: optionalText,
});

router.post('/', requirePerm('LH-02'), async (req, res) => {
  const user = currentUser(req);
  const body = createSchema.parse(req.body);
  const groupId = await withTx(user.id, async (db) => {
    await ensurePatient(db, body.patient_id);
    const slots = body.slots ?? (await defaultSlots(db, body.service_id));
    const past = await queryOne<{ past: boolean }>(
      `SELECT ($1::date + $2::time) < clinic_local(now()) AS past`,
      [body.date, body.start_time],
      db,
    );
    if (past?.past) throw badRequest('Không thể đặt lịch vào thời điểm đã qua');
    return insertGroup(db, {
      patientId: body.patient_id,
      doctorId: body.doctor_id,
      chairId: body.chair_id,
      serviceId: body.service_id ?? null,
      date: body.date,
      startTime: body.start_time,
      slots,
      status: 'BOOKED',
      source: user.role === 'DOCTOR' ? 'DOCTOR_FOLLOW_UP' : 'RECEPTION',
      note: body.note ?? null,
      staffId: user.id,
    });
  });
  const group = await queryOne(`${groupsSql('x.booking_group_id = $1::uuid')}`, [groupId]);
  res.status(201).json(group);
});

/* ------------------------------ LH-03: đổi lịch ------------------------------ */

router.put('/groups/:groupId/reschedule', requirePerm('LH-03'), async (req, res) => {
  const user = currentUser(req);
  const groupId = groupIdParam(req.params.groupId);
  const body = z
    .object({
      doctor_id: z.coerce.number().int().positive(),
      chair_id: z.coerce.number().int().positive(),
      date: dateStr,
      start_time: timeStr,
      note: optionalText,
    })
    .parse(req.body);

  await withTx(user.id, async (db) => {
    const slots = await loadGroupSlots(groupId, db);
    if (slots.some((s) => s.status !== 'BOOKED')) throw conflict('Chỉ đổi được lịch ở trạng thái "Đã đặt"');

    const target = await queryOne<{ new_start: Date; past: boolean; later: boolean }>(
      `SELECT ($1::date + $2::time) AT TIME ZONE '${TZ}' AS new_start,
              ($1::date + $2::time) < clinic_local(now()) AS past,
              ($1::date + $2::time) AT TIME ZONE '${TZ}' > $3::timestamptz AS later`,
      [body.date, body.start_time, slots[0].start_at],
      db,
    );
    if (target!.past) throw badRequest('Không thể dời lịch về thời điểm đã qua');

    // Ràng buộc chống trùng kiểm tra từng dòng ngay lập tức: dời về sau thì cập nhật khung cuối
    // trước, dời về trước thì khung đầu trước — tránh nhóm tự đè lên chính nó.
    const order = slots.map((s, i) => ({ id: s.id, i }));
    if (target!.later) order.reverse();
    for (const { id, i } of order) {
      await db.query(
        `UPDATE appointments
         SET doctor_id = $1, chair_id = $2,
             start_at = $3::timestamptz + $4::int * interval '30 minutes',
             end_at = $3::timestamptz + ($4::int + 1) * interval '30 minutes',
             note = coalesce($5, note), updated_by = $6
         WHERE id = $7`,
        [body.doctor_id, body.chair_id, target!.new_start, i, body.note ?? null, user.id, id],
      );
    }
  });
  res.json(await queryOne(`${groupsSql('x.booking_group_id = $1::uuid')}`, [groupId]));
});

/* ------------------------------ LH-04: hủy lịch ------------------------------ */

router.post('/groups/:groupId/cancel', requirePerm('LH-04'), async (req, res) => {
  const user = currentUser(req);
  const groupId = groupIdParam(req.params.groupId);
  const body = z
    .object({
      cancel_reason_id: z.coerce.number({ error: 'Phải chọn lý do hủy' }).int().positive('Phải chọn lý do hủy'),
      cancel_note: optionalText,
    })
    .parse(req.body);

  await withTx(user.id, async (db) => {
    const slots = await loadGroupSlots(groupId, db);
    if (slots.some((s) => !['BOOKED', 'ARRIVED'].includes(s.status))) {
      throw conflict('Chỉ hủy được lịch "Đã đặt" hoặc "Đã đến" (chưa khám)');
    }
    const reason = await queryOne('SELECT id FROM cancel_reasons WHERE id = $1 AND is_active', [body.cancel_reason_id], db);
    if (!reason) throw badRequest('Lý do hủy không hợp lệ');
    await db.query(
      `UPDATE appointments
       SET status = 'CANCELLED', cancel_reason_id = $1, cancel_note = $2,
           cancelled_by = $3, cancelled_at = now(), updated_by = $3
       WHERE booking_group_id = $4::uuid`,
      [body.cancel_reason_id, body.cancel_note ?? null, user.id, groupId],
    );
  });
  res.json(await queryOne(`${groupsSql('x.booking_group_id = $1::uuid')}`, [groupId]));
});

/* ------------------------------ LH-08: tiếp đón ------------------------------ */

router.post('/groups/:groupId/check-in', requirePerm('LH-08'), async (req, res) => {
  const user = currentUser(req);
  const groupId = groupIdParam(req.params.groupId);
  await withTx(user.id, async (db) => {
    const slots = await loadGroupSlots(groupId, db);
    if (slots.some((s) => s.status !== 'BOOKED')) throw conflict('Chỉ tiếp đón được lịch ở trạng thái "Đã đặt"');
    if (!slots[0].is_today) throw badRequest('Chỉ tiếp đón lịch hẹn của hôm nay');
    await db.query(
      `UPDATE appointments SET status = 'ARRIVED', checked_in_at = now(), updated_by = $1
       WHERE booking_group_id = $2::uuid`,
      [user.id, groupId],
    );
  });
  res.json(await queryOne(`${groupsSql('x.booking_group_id = $1::uuid')}`, [groupId]));
});

/* ------------------------------ LH-09: khách vãng lai ------------------------------ */

router.post('/walk-in', requirePerm('LH-09'), async (req, res) => {
  const user = currentUser(req);
  const body = z
    .object({
      patient_id: z.coerce.number().int().positive(),
      doctor_id: z.coerce.number().int().positive(),
      service_id: z.coerce.number().int().positive().nullish(),
      slots: slotCount.optional(),
      note: optionalText,
    })
    .parse(req.body);

  const groupId = await withTx(user.id, async (db) => {
    await ensurePatient(db, body.patient_id);
    const slots = body.slots ?? (await defaultSlots(db, body.service_id));
    const today = (await queryOne<{ d: string }>("SELECT to_char(clinic_local(now()), 'YYYY-MM-DD') AS d", [], db))!.d;
    const free = await findFreeSlots(
      { date: today, doctorId: body.doctor_id, slots, excludeGroup: null, roundDownNow: true },
      db,
    );
    if (!free.length) {
      throw conflict(`Hôm nay bác sĩ không còn ${slots} khung trống liên tiếp (hoặc không có ca trực) — chọn bác sĩ khác`);
    }
    const first = free[0];
    return insertGroup(db, {
      patientId: body.patient_id,
      doctorId: body.doctor_id,
      chairId: first.free_chair_ids[0],
      serviceId: body.service_id ?? null,
      date: today,
      startTime: first.start_time,
      slots,
      status: 'ARRIVED',
      source: 'WALK_IN',
      note: body.note ?? null,
      staffId: user.id,
    });
  });
  res.status(201).json(await queryOne(`${groupsSql('x.booking_group_id = $1::uuid')}`, [groupId]));
});

/* ------------------------------ LH-05 / LH-06: nhắc lịch ------------------------------ */

router.get('/reminders', requirePerm('LH-05'), async (req, res) => {
  const q = z.object({ date: dateStr.optional() }).parse(req.query);
  const date =
    q.date ?? (await queryOne<{ d: string }>("SELECT to_char(clinic_local(now())::date + 1, 'YYYY-MM-DD') AS d"))!.d;
  const rows = await query(
    `SELECT grp.*, gd.full_name AS guardian_name, gd.relationship AS guardian_relationship, gd.phone AS guardian_phone,
            coalesce(h.history, '[]'::jsonb) AS reminders
     FROM (${groupsSql("clinic_local(x.start_at)::date = $1::date AND x.status = 'BOOKED'")}) grp
     LEFT JOIN LATERAL (
       SELECT full_name, relationship, phone FROM patient_guardians
       WHERE patient_id = grp.patient_id ORDER BY is_primary DESC, id LIMIT 1
     ) gd ON true
     LEFT JOIN LATERAL (
       SELECT jsonb_agg(jsonb_build_object(
                'id', r.id, 'channel', r.channel, 'result', r.result, 'recipient_phone', r.recipient_phone,
                'message_content', r.message_content, 'provider_message_id', r.provider_message_id,
                'note', r.note, 'performed_by_name', st.full_name, 'performed_at', r.performed_at)
              ORDER BY r.performed_at) AS history
       FROM appointment_reminders r
       JOIN appointments ap ON ap.id = r.appointment_id
       LEFT JOIN staff st ON st.id = r.performed_by
       WHERE ap.booking_group_id = grp.booking_group_id
     ) h ON true
     ORDER BY grp.start_at`,
    [date],
  );
  res.json({ date, groups: rows });
});

/** LH-05/LH-06: chỉ nhắc lịch hẹn "Đã đặt" chưa tới giờ (không nhắc lịch đã hủy/đã khám/đã qua) */
function assertRemindable(slots: GroupSlot[]): void {
  if (slots.some((s) => s.status !== 'BOOKED')) throw conflict('Chỉ nhắc lịch cho lịch hẹn ở trạng thái "Đã đặt"');
  if (new Date(slots[0].start_at) <= new Date()) throw conflict('Lịch hẹn đã qua giờ hẹn, không cần nhắc lịch');
}

const CALL_RESULTS = ['CONFIRMED', 'NO_ANSWER', 'WRONG_NUMBER', 'RESCHEDULE_REQUESTED', 'CANCEL_REQUESTED'] as const;

router.post('/groups/:groupId/reminders', requirePerm('LH-05'), async (req, res) => {
  const user = currentUser(req);
  const groupId = groupIdParam(req.params.groupId);
  const body = z
    .object({
      result: z.enum(CALL_RESULTS, { error: 'Kết quả gọi không hợp lệ' }),
      recipient_phone: optionalText,
      note: optionalText,
    })
    .parse(req.body);
  const row = await withTx(user.id, async (db) => {
    const slots = await loadGroupSlots(groupId, db);
    assertRemindable(slots);
    return queryOne(
      `INSERT INTO appointment_reminders (appointment_id, channel, result, recipient_phone, note, performed_by)
       VALUES ($1, 'CALL', $2, coalesce($3, (SELECT phone FROM patients WHERE id = $4)), $5, $6)
       RETURNING *`,
      [slots[0].id, body.result, body.recipient_phone ?? null, slots[0].patient_id, body.note ?? null, user.id],
      db,
    );
  });
  res.status(201).json(row);
});

router.post('/groups/:groupId/send-message', requirePerm('LH-06'), async (req, res) => {
  const user = currentUser(req);
  const groupId = groupIdParam(req.params.groupId);
  const body = z
    .object({
      channel: z.enum(['SMS', 'ZALO']),
      message: z.string().trim().min(1, 'Nội dung tin nhắn không được trống').max(1000),
      recipient_phone: optionalText,
    })
    .parse(req.body);

  const slots = await loadGroupSlots(groupId);
  assertRemindable(slots);
  const phone =
    body.recipient_phone ??
    (
      await queryOne<{ phone: string | null }>(
        `SELECT coalesce(p.phone, (SELECT g.phone FROM patient_guardians g WHERE g.patient_id = p.id
                                   ORDER BY g.is_primary DESC, g.id LIMIT 1)) AS phone
         FROM patients p WHERE p.id = $1`,
        [slots[0].patient_id],
      )
    )?.phone;
  if (!phone) throw badRequest('Bệnh nhân và người giám hộ đều không có số điện thoại');

  const sent = await messageGateway
    .send({ channel: body.channel, to: phone, content: body.message })
    .catch((e: Error) => ({ ok: false, providerMessageId: null, error: e.message }));

  const row = await withTx(user.id, (db) =>
    queryOne(
      `INSERT INTO appointment_reminders (appointment_id, channel, result, recipient_phone, message_content,
                                          provider_message_id, note, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        slots[0].id,
        body.channel,
        sent.ok ? 'SENT' : 'FAILED',
        phone,
        body.message,
        sent.providerMessageId,
        sent.ok ? null : (sent.error ?? 'Gửi thất bại'),
        user.id,
      ],
      db,
    ),
  );
  if (!sent.ok) throw new HttpError(502, `Gửi tin thất bại: ${sent.error ?? ''}`);
  res.status(201).json(row);
});

export default router;
