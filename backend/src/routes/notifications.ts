// Thông báo trong hệ thống (DT-07: cảnh báo vật tư dưới ngưỡng gửi Quản lý)
import { Router } from 'express';
import { currentUser, hasPerm } from '../auth.js';
import { query, queryOne } from '../db.js';
import { notFound } from '../errors.js';
import { idParam } from '../validate.js';

const router = Router();

// $1 = nhân viên, $2 = có quyền DT-07 — cảnh báo vật tư dưới ngưỡng chỉ theo ma trận phân quyền, không theo vai trò nhận
const FOR_USER = `(n.recipient_staff_id = $1
                  OR (n.notification_type <> 'LOW_STOCK'
                      AND n.recipient_role_id = (SELECT role_id FROM staff WHERE id = $1))
                  OR ($2 AND n.notification_type = 'LOW_STOCK'))`;

router.get('/', async (req, res) => {
  const user = currentUser(req);
  const rows = await query(
    `SELECT n.id, n.notification_type, n.title, n.content, n.ref_table, n.ref_id,
            n.is_read, n.read_at, r.full_name AS read_by_name, n.created_at
     FROM notifications n LEFT JOIN staff r ON r.id = n.read_by
     WHERE ${FOR_USER}
     ORDER BY n.is_read, n.created_at DESC
     LIMIT 100`,
    [user.id, hasPerm(req, 'DT-07')],
  );
  res.json(rows);
});

router.get('/unread-count', async (req, res) => {
  const user = currentUser(req);
  const row = await queryOne<{ count: number }>(
    `SELECT count(*) AS count FROM notifications n WHERE NOT n.is_read AND ${FOR_USER}`,
    [user.id, hasPerm(req, 'DT-07')],
  );
  res.json({ count: row?.count ?? 0 });
});

router.post('/:id/read', async (req, res) => {
  const user = currentUser(req);
  const row = await queryOne(
    `UPDATE notifications n SET is_read = true, read_by = $1, read_at = now()
     WHERE n.id = $3 AND ${FOR_USER} RETURNING n.id`,
    [user.id, hasPerm(req, 'DT-07'), idParam(req.params.id)],
  );
  if (!row) throw notFound('Không tìm thấy thông báo');
  res.json({ ok: true });
});

export default router;
