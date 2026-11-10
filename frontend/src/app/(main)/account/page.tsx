'use client';

import { type FormEvent, useState } from 'react';
import { Alert, Button, Card, Field, Input, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction } from '@/lib/hooks';

export default function AccountPage() {
  const { user, refreshUser } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const { run, busy } = useAction();
  const mismatch = confirm.length > 0 && confirm !== next;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const forced = user.mustChangePassword;
    const ok = await run(
      () => api.post('/auth/change-password', { current_password: current, new_password: next }),
      'Đã đổi mật khẩu',
    );
    if (ok) {
      setCurrent('');
      setNext('');
      setConfirm('');
      if (forced) window.location.href = '/';
      else await refreshUser();
    }
  }

  return (
    <>
      <PageHeader title="Đổi mật khẩu" subtitle="UC-00" />
      {user.mustChangePassword && (
        <div className="mb-4 max-w-md">
          <Alert kind="warning" title="Bạn cần đổi mật khẩu">
            Tài khoản đang dùng mật khẩu tạm do Quản lý cấp. Hãy đặt mật khẩu mới để tiếp tục sử dụng hệ thống.
          </Alert>
        </div>
      )}
      <Card className="max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Mật khẩu hiện tại" required>
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label="Mật khẩu mới" required hint="Tối thiểu 8 ký tự, khác mật khẩu hiện tại">
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Nhập lại mật khẩu mới" required error={mismatch ? 'Mật khẩu nhập lại không khớp' : null}>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </Field>
          <Button type="submit" loading={busy} disabled={!current || next.length < 8 || confirm !== next}>
            Đổi mật khẩu
          </Button>
        </form>
      </Card>
    </>
  );
}
