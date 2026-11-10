'use client';

import { type FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Smile } from 'lucide-react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api } from '@/lib/api';
import type { AuthUser } from '@/lib/types';

/** Chỉ cho quay lại trang trong cùng ứng dụng (chặn open redirect kiểu //host, /\host) */
function safeNext(next: string | null): string {
  if (!next) return '/';
  try {
    const url = new URL(next, window.location.origin);
    return url.origin === window.location.origin ? url.pathname + url.search + url.hash : '/';
  } catch {
    return '/';
  }
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await api.post<AuthUser>('/auth/login', { username, password });
      window.location.href = user.mustChangePassword ? '/account' : safeNext(searchParams.get('next'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert kind="error">{error}</Alert>}
      <Field label="Tên đăng nhập" required>
        <Input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
      </Field>
      <Field label="Mật khẩu" required>
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Button type="submit" className="w-full" loading={busy} disabled={!username || !password}>
        Đăng nhập
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-teal-50 to-slate-100 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-2 rounded-full bg-teal-50 p-3">
            <Smile className="h-8 w-8 text-teal-600" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Nha khoa Nụ Cười Việt</h1>
          <p className="text-sm text-slate-500">Đăng nhập hệ thống quản lý phòng khám</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
