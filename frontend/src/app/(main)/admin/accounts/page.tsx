'use client';

import { type FormEvent, useState } from 'react';
import { KeyRound, Lock, LockOpen, Pencil, UserPlus } from 'lucide-react';
import { PermissionMatrix } from '@/components/admin/PermissionMatrix';
import {
  AsyncBoundary,
  Badge,
  Button,
  Card,
  Checkbox,
  DataTable,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Tabs,
} from '@/components/ui';
import { api } from '@/lib/api';
import { RequirePerm, useAuth, useLookups } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';
import { labelOf, ROLE } from '@/lib/labels';

interface StaffRow {
  id: number;
  staff_code: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  username: string;
  role_id: number;
  role: string;
  role_name: string;
  is_part_time: boolean;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
}

interface StaffForm {
  staff_code: string;
  full_name: string;
  phone: string;
  email: string;
  username: string;
  role_id: string;
  is_part_time: boolean;
  is_active: boolean;
  password: string;
}

function staffPayload(f: StaffForm) {
  return {
    staff_code: f.staff_code,
    full_name: f.full_name,
    phone: f.phone,
    email: f.email,
    username: f.username,
    role_id: Number(f.role_id),
    is_part_time: f.is_part_time,
    is_active: f.is_active,
  };
}

function toForm(r: StaffRow): StaffForm {
  return {
    staff_code: r.staff_code,
    full_name: r.full_name,
    phone: r.phone ?? '',
    email: r.email ?? '',
    username: r.username,
    role_id: String(r.role_id),
    is_part_time: r.is_part_time,
    is_active: r.is_active,
    password: '',
  };
}

export default function AccountsPage() {
  const [tab, setTab] = useState<'staff' | 'permissions'>('staff');
  return (
    <RequirePerm perms={['QT-05']}>
      <PageHeader title="Tài khoản & phân quyền" subtitle="QT-05 · Nhân viên, tài khoản đăng nhập và quyền theo vai trò" />
      <Tabs
        tabs={[
          { key: 'staff', label: 'Nhân viên' },
          { key: 'permissions', label: 'Phân quyền' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'staff' ? <StaffTab /> : <PermissionMatrix />}
    </RequirePerm>
  );
}

function StaffTab() {
  const { user, reloadLookups } = useAuth();
  const { data, loading, error, reload } = useApi<StaffRow[]>('/admin/staff');
  const [editing, setEditing] = useState<{ id: number | null; form: StaffForm } | null>(null);
  const [resetting, setResetting] = useState<StaffRow | null>(null);
  const { run, busy } = useAction();
  const lookups = useLookups();

  function changed() {
    reload();
    reloadLookups().catch(() => undefined);
  }

  async function toggleActive(r: StaffRow) {
    const next = !r.is_active;
    if (!window.confirm(`${next ? 'Mở khóa' : 'Khóa'} tài khoản của ${r.full_name}?`)) return;
    const ok = await run(
      () => api.put(`/admin/staff/${r.id}`, staffPayload({ ...toForm(r), is_active: next })),
      next ? 'Đã mở khóa tài khoản' : 'Đã khóa tài khoản',
    );
    if (ok) changed();
  }

  const emptyForm: StaffForm = {
    staff_code: '',
    full_name: '',
    phone: '',
    email: '',
    username: '',
    role_id: String(lookups.roles.find((r) => r.code === 'RECEPTIONIST')?.id ?? lookups.roles[0]?.id ?? ''),
    is_part_time: false,
    is_active: true,
    password: '',
  };

  return (
    <>
      <Card
        bodyClassName="p-0"
        title="Danh sách nhân viên"
        actions={
          <Button onClick={() => setEditing({ id: null, form: emptyForm })}>
            <UserPlus className="h-4 w-4" /> Thêm nhân viên
          </Button>
        }
      >
        <AsyncBoundary loading={loading && !data} error={error}>
          <DataTable
            rows={data}
            rowKey={(r) => r.id}
            columns={[
              {
                key: 'name',
                header: 'Nhân viên',
                render: (r) => (
                  <div className={r.is_active ? '' : 'opacity-60'}>
                    <div className="font-medium text-slate-900">
                      {r.full_name}
                      {r.id === user.id && <span className="ml-1 text-xs text-teal-600">(bạn)</span>}
                    </div>
                    <div className="text-xs text-slate-500">
                      {r.staff_code} · <span className="font-mono">{r.username}</span>
                    </div>
                  </div>
                ),
              },
              {
                key: 'role',
                header: 'Vai trò',
                render: (r) => (
                  <div className="flex flex-wrap gap-1">
                    <StatusBadge label={labelOf(ROLE, r.role)} />
                    {r.is_part_time && <Badge color="orange">Bán thời gian</Badge>}
                  </div>
                ),
              },
              {
                key: 'contact',
                header: 'Liên hệ',
                render: (r) => (
                  <div className="text-xs">
                    <div>{r.phone ?? '—'}</div>
                    <div className="text-slate-500">{r.email ?? ''}</div>
                  </div>
                ),
              },
              {
                key: 'status',
                header: 'Trạng thái',
                render: (r) => (
                  <div className="flex flex-wrap gap-1">
                    {r.is_active ? <Badge color="green">Hoạt động</Badge> : <Badge color="red">Đã khóa</Badge>}
                    {r.must_change_password && <Badge color="yellow">Chờ đổi mật khẩu</Badge>}
                  </div>
                ),
              },
              { key: 'login', header: 'Đăng nhập gần nhất', render: (r) => fmtDateTime(r.last_login_at) },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (r) => (
                  <div className="flex justify-end gap-1 whitespace-nowrap">
                    <Button size="sm" variant="secondary" onClick={() => setEditing({ id: r.id, form: toForm(r) })}>
                      <Pencil className="h-3.5 w-3.5" /> Sửa
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setResetting(r)} title="Đặt lại mật khẩu">
                      <KeyRound className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy || r.id === user.id}
                      onClick={() => toggleActive(r)}
                      title={r.id === user.id ? 'Không thể tự khóa tài khoản' : r.is_active ? 'Khóa' : 'Mở khóa'}
                    >
                      {r.is_active ? <Lock className="h-3.5 w-3.5 text-red-600" /> : <LockOpen className="h-3.5 w-3.5 text-emerald-600" />}
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </AsyncBoundary>
      </Card>

      {editing && (
        <StaffModal
          id={editing.id}
          initial={editing.form}
          isSelf={editing.id === user.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            changed();
          }}
        />
      )}
      {resetting && <ResetPasswordModal staff={resetting} onClose={() => setResetting(null)} onSaved={() => { setResetting(null); reload(); }} />}
    </>
  );
}

function StaffModal({
  id,
  initial,
  isSelf,
  onClose,
  onSaved,
}: {
  id: number | null;
  initial: StaffForm;
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const lookups = useLookups();
  const [f, setF] = useState<StaffForm>(initial);
  const { run, busy } = useAction();
  const set = <K extends keyof StaffForm>(k: K, v: StaffForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const valid = f.staff_code.trim() && f.full_name.trim() && f.username.trim().length >= 3 && f.role_id && (id || f.password.length >= 8);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await run(
      () => (id ? api.put(`/admin/staff/${id}`, staffPayload(f)) : api.post('/admin/staff', { ...staffPayload(f), password: f.password })),
      id ? 'Đã cập nhật nhân viên' : 'Đã tạo tài khoản — nhân viên phải đổi mật khẩu khi đăng nhập',
    );
    if (ok) onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={id ? `Sửa nhân viên — ${initial.full_name}` : 'Thêm nhân viên'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" form="staff-form" loading={busy} disabled={!valid}>
            Lưu
          </Button>
        </>
      }
    >
      <form id="staff-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Mã nhân viên" required>
          <Input value={f.staff_code} onChange={(e) => set('staff_code', e.target.value)} placeholder="vd. BS05" />
        </Field>
        <Field label="Họ tên" required>
          <Input value={f.full_name} onChange={(e) => set('full_name', e.target.value)} />
        </Field>
        <Field label="Số điện thoại">
          <Input value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Tên đăng nhập" required hint="Chữ không dấu, số, dấu chấm, gạch">
          <Input value={f.username} onChange={(e) => set('username', e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Vai trò" required hint={isSelf ? 'Không thể tự đổi vai trò của chính mình' : undefined}>
          <Select value={f.role_id} disabled={isSelf} onChange={(e) => set('role_id', e.target.value)}>
            {lookups.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        {!id && (
          <Field label="Mật khẩu ban đầu" required hint="Tối thiểu 8 ký tự; nhân viên đổi lại sau khi đăng nhập">
            <Input type="password" value={f.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
          </Field>
        )}
        <div className="flex flex-col justify-end gap-2 pb-2">
          <Checkbox label="Bán thời gian (bác sĩ 3 ngày/tuần)" checked={f.is_part_time} onChange={(v) => set('is_part_time', v)} />
          {id && <Checkbox label="Tài khoản đang hoạt động" checked={f.is_active} disabled={isSelf} onChange={(v) => set('is_active', v)} />}
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ staff, onClose, onSaved }: { staff: StaffRow; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState('');
  const { run, busy } = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await run(
      () => api.post(`/admin/staff/${staff.id}/reset-password`, { new_password: password }),
      'Đã đặt lại mật khẩu — nhân viên phải đổi mật khẩu khi đăng nhập',
    );
    if (ok) onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Đặt lại mật khẩu — ${staff.full_name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" form="reset-form" loading={busy} disabled={password.length < 8}>
            Đặt lại
          </Button>
        </>
      }
    >
      <form id="reset-form" onSubmit={submit}>
        <Field label="Mật khẩu mới" required hint="Tối thiểu 8 ký tự">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
        </Field>
      </form>
    </Modal>
  );
}
