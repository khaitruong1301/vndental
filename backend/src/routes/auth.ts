// UC-00: Đăng nhập / Đăng xuất / Đổi mật khẩu
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { clearAuthCookie, currentUser, loadStaffAuth, requireAuth, setAuthCookie, signToken } from '../auth';
import { query, queryOne, withTx } from '../db';
import { badRequest, HttpError } from '../errors';

const router = Router();

router.post('/login', async (req, res) => {
  const { username, password } = z
    .object({ username: z.string().trim().min(1), password: z.string().min(1) })
    .parse(req.body);

  const staff = await queryOne<{ id: number; password_hash: string }>(
    'SELECT id, password_hash FROM staff WHERE lower(username) = lower($1)',
    [username],
  );
  if (!staff || !(await bcrypt.compare(password, staff.password_hash))) {
    throw new HttpError(401, 'Sai tên đăng nhập hoặc mật khẩu');
  }
  const auth = await loadStaffAuth(staff.id);
  if (!auth || !auth.active) throw new HttpError(403, 'Tài khoản đã bị khóa');

  await query('UPDATE staff SET last_login_at = now() WHERE id = $1', [staff.id]);
  setAuthCookie(res, signToken(staff.id, auth.tokenVersion));
  res.json(auth.user);
});

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json(currentUser(req));
});

router.post('/change-password', requireAuth, async (req, res) => {
  const user = currentUser(req);
  const { current_password, new_password } = z
    .object({
      current_password: z.string().min(1),
      new_password: z.string().min(8, 'Mật khẩu mới tối thiểu 8 ký tự'),
    })
    .parse(req.body);

  const staff = await queryOne<{ password_hash: string }>('SELECT password_hash FROM staff WHERE id = $1', [user.id]);
  if (!staff || !(await bcrypt.compare(current_password, staff.password_hash))) {
    throw badRequest('Mật khẩu hiện tại không đúng');
  }
  if (await bcrypt.compare(new_password, staff.password_hash)) {
    throw badRequest('Mật khẩu mới phải khác mật khẩu hiện tại');
  }
  const hash = await bcrypt.hash(new_password, 10);
  // Trigger tăng token_version → các phiên khác đăng xuất; cấp lại cookie cho phiên hiện tại
  const row = await withTx(user.id, (db) =>
    queryOne<{ token_version: number }>(
      'UPDATE staff SET password_hash = $1, must_change_password = false WHERE id = $2 RETURNING token_version',
      [hash, user.id],
      db,
    ),
  );
  setAuthCookie(res, signToken(user.id, row!.token_version));
  res.json({ ok: true });
});

export default router;
