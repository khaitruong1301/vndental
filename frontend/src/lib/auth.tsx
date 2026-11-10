'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { EmptyState, Loading } from '@/components/ui';
import { api } from './api';
import type { AuthUser, Lookups } from './types';

interface AuthContextValue {
  user: AuthUser;
  /** true nếu có ít nhất một trong các quyền (mã use case) */
  can: (...codes: string[]) => boolean;
  logout: () => Promise<void>;
  /** Tải lại thông tin người dùng (sau khi đổi mật khẩu) */
  refreshUser: () => Promise<void>;
  lookups: Lookups;
  reloadLookups: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Tải người dùng hiện tại + danh mục dùng chung một lần cho toàn bộ khu vực đã đăng nhập */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  const reloadLookups = useCallback(async () => {
    setLookups(await api.get<Lookups>('/lookups'));
  }, []);

  const refreshUser = useCallback(async () => {
    setUser(await api.get<AuthUser>('/auth/me'));
  }, []);

  useEffect(() => {
    refreshUser().catch(() => {
      window.location.href = '/login';
    });
    reloadLookups().catch(() => undefined);
  }, [refreshUser, reloadLookups]);

  // Bắt buộc đổi mật khẩu trước khi dùng các màn hình khác
  useEffect(() => {
    if (user?.mustChangePassword && pathname !== '/account') router.replace('/account');
  }, [user, pathname, router]);

  const can = useCallback(
    (...codes: string[]) => !!user && codes.some((c) => user.permissions.includes(c)),
    [user],
  );

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    window.location.href = '/login';
  }, []);

  // Đang bắt buộc đổi mật khẩu: không render trang khác (tránh gọi API bị 403) trong lúc chuyển tới /account
  if (!user || !lookups || (user.mustChangePassword && pathname !== '/account')) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loading text="Đang tải phiên làm việc..." />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, can, logout, refreshUser, lookups, reloadLookups }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider');
  return ctx;
}

/** Danh mục dùng chung: bác sĩ, ghế, dịch vụ (kèm giá hiện hành), thuốc/vật tư, lý do hủy */
export function useLookups(): Lookups {
  return useAuth().lookups;
}

/** Ẩn nội dung nếu người dùng không có quyền nào trong danh sách */
export function RequirePerm({ perms, children }: { perms: string[]; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(...perms)) {
    return (
      <EmptyState title="Bạn không có quyền truy cập chức năng này">
        <ShieldAlert className="mx-auto mt-2 h-6 w-6 text-slate-400" />
      </EmptyState>
    );
  }
  return <>{children}</>;
}
