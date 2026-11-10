import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { query, queryOne } from './db.js';
import { forbidden, HttpError } from './errors.js';

export interface AuthUser {
  id: number;
  staffCode: string;
  name: string;
  role: 'RECEPTIONIST' | 'DOCTOR' | 'MANAGER';
  permissions: string[]; // mã use case, gồm quyền kế thừa (Quản lý ⊃ Lễ tân)
  mustChangePassword: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** JWT chỉ mang id + token_version; vai trò/quyền/trạng thái luôn đọc lại từ DB */
interface TokenPayload {
  id: number;
  ver: number;
}

export const AUTH_COOKIE = 'clinic_token';
const TOKEN_TTL_SECONDS = 12 * 60 * 60;

export function signToken(staffId: number, tokenVersion: number): string {
  const payload: TokenPayload = { id: staffId, ver: tokenVersion };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: TOKEN_TTL_SECONDS });
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: TOKEN_TTL_SECONDS * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
}

interface StaffAuthRow {
  id: number;
  staff_code: string;
  full_name: string;
  is_active: boolean;
  must_change_password: boolean;
  token_version: number;
  role_id: number;
  role: AuthUser['role'];
}

/** Thông tin đăng nhập hiện hành của nhân viên (null nếu không tồn tại) */
export async function loadStaffAuth(staffId: number): Promise<{ user: AuthUser; active: boolean; tokenVersion: number } | null> {
  const staff = await queryOne<StaffAuthRow>(
    `SELECT s.id, s.staff_code, s.full_name, s.is_active, s.must_change_password, s.token_version,
            s.role_id, r.code AS role
     FROM staff s JOIN roles r ON r.id = s.role_id
     WHERE s.id = $1`,
    [staffId],
  );
  if (!staff) return null;
  const perms = await query<{ permission_code: string }>(
    'SELECT permission_code FROM v_role_effective_permissions WHERE role_id = $1 ORDER BY 1',
    [staff.role_id],
  );
  return {
    active: staff.is_active,
    tokenVersion: staff.token_version,
    user: {
      id: staff.id,
      staffCode: staff.staff_code,
      name: staff.full_name,
      role: staff.role,
      permissions: perms.map((p) => p.permission_code),
      mustChangePassword: staff.must_change_password,
    },
  };
}

/**
 * Xác thực mỗi request: JWT hợp lệ + tài khoản còn hoạt động + token_version khớp
 * (khóa tài khoản / đổi mật khẩu có hiệu lực ngay; đổi quyền áp dụng từ request kế tiếp).
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) throw new HttpError(401, 'Chưa đăng nhập');
  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret) as TokenPayload;
  } catch {
    throw new HttpError(401, 'Phiên đăng nhập đã hết hạn');
  }
  const auth = await loadStaffAuth(payload.id);
  if (!auth || !auth.active) throw new HttpError(401, 'Tài khoản đã bị khóa hoặc không còn tồn tại');
  if (auth.tokenVersion !== payload.ver) throw new HttpError(401, 'Phiên đăng nhập đã hết hiệu lực, vui lòng đăng nhập lại');
  req.user = auth.user;
  next();
}

// API vẫn dùng được khi đang bắt buộc đổi mật khẩu (để tải khung giao diện)
const ALLOWED_BEFORE_PASSWORD_CHANGE = ['/lookups', '/notifications/unread-count'];

/** Tài khoản mới / vừa đặt lại mật khẩu phải đổi mật khẩu trước khi dùng hệ thống */
export function requirePasswordChanged(req: Request, _res: Response, next: NextFunction): void {
  if (currentUser(req).mustChangePassword && !ALLOWED_BEFORE_PASSWORD_CHANGE.includes(req.path)) {
    throw new HttpError(403, 'Bạn cần đổi mật khẩu trước khi sử dụng hệ thống', { code: 'MUST_CHANGE_PASSWORD' });
  }
  next();
}

/** Cho phép nếu người dùng có ít nhất một trong các quyền (mã use case) */
export const requirePerm =
  (...codes: string[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const user = currentUser(req);
    if (!codes.some((c) => user.permissions.includes(c))) throw forbidden();
    next();
  };

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new HttpError(401, 'Chưa đăng nhập');
  return req.user;
}

export function hasPerm(req: Request, code: string): boolean {
  return currentUser(req).permissions.includes(code);
}
