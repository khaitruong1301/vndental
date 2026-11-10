'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { Bell, KeyRound, LogOut, Menu, Smile, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { labelOf, ROLE } from '@/lib/labels';
import { NAV } from '@/lib/nav';
import { cn } from './ui';

/** Phát sự kiện này sau khi đánh dấu thông báo đã xem để huy hiệu cập nhật ngay */
export const NOTIFICATIONS_CHANGED = 'clinic:notifications-changed';

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, can, logout } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const load = () =>
      api
        .get<{ count: number }>('/notifications/unread-count')
        .then((r) => setUnread(r.count))
        .catch(() => undefined);
    load();
    const timer = setInterval(load, 60_000);
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => {
      clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED, load);
    };
  }, [pathname]);

  useEffect(() => setOpen(false), [pathname]);

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.perms.length || can(...i.perms)) })).filter(
    (g) => g.items.length,
  );

  return (
    <div className="min-h-screen">
      <aside
        className={cn(
          'no-print fixed inset-y-0 left-0 z-40 w-64 overflow-y-auto border-r border-slate-200 bg-white transition-transform lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-slate-100 px-4">
          <Smile className="h-6 w-6 text-teal-600" />
          <div className="leading-tight">
            <div className="text-sm font-semibold text-slate-900">Nha khoa Nụ Cười Việt</div>
            <div className="text-xs text-slate-500">Hệ thống quản lý phòng khám</div>
          </div>
          <button type="button" className="ml-auto lg:hidden" onClick={() => setOpen(false)} aria-label="Đóng menu">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>
        <nav className="space-y-4 px-3 py-4">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.label}</div>
              {g.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm',
                      active ? 'bg-teal-50 font-medium text-teal-700' : 'text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                    {item.href === '/notifications' && unread > 0 && (
                      <span className="ml-auto rounded-full bg-red-500 px-1.5 text-xs text-white">{unread}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur">
          <button type="button" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Mở menu">
            <Menu className="h-5 w-5 text-slate-600" />
          </button>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/notifications" className="relative rounded p-1.5 text-slate-500 hover:bg-slate-100" title="Thông báo">
              <Bell className="h-5 w-5" />
              {unread > 0 && <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-red-500" />}
            </Link>
            <div className="text-right leading-tight">
              <div className="text-sm font-medium text-slate-800">{user.name}</div>
              <div className="text-xs text-slate-500">
                {user.staffCode} · {labelOf(ROLE, user.role).label}
              </div>
            </div>
            <Link href="/account" className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="Đổi mật khẩu">
              <KeyRound className="h-5 w-5" />
            </Link>
            <button
              type="button"
              onClick={logout}
              className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
              title="Đăng xuất"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
