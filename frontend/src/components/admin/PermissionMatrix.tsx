'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { Alert, AsyncBoundary, Button, Card, cn } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction, useApi } from '@/lib/hooks';

interface RolesData {
  roles: { id: number; code: string; name: string; parent_role_id: number | null; parent_name: string | null; staff_count: number }[];
  permissions: { id: number; code: string; module: string; name: string }[];
  direct: { role_id: number; permission_code: string }[];
  effective: { role_id: number; permission_code: string }[];
}

const MODULES: Record<string, string> = {
  CHUNG: 'Chung',
  BENH_NHAN: 'Bệnh nhân',
  LICH_HEN: 'Lịch hẹn',
  DIEU_TRI: 'Khám & điều trị',
  THANH_TOAN: 'Thanh toán',
  QUAN_TRI: 'Quản trị',
  BAO_CAO: 'Báo cáo',
};

type Draft = Record<number, string[]>;

/** QT-05: ma trận quyền (mã use case) × vai trò; quyền kế thừa từ vai trò cha hiện sẵn và không bỏ được */
export function PermissionMatrix() {
  const { data, loading, error, reload } = useApi<RolesData>('/admin/roles');
  const [draft, setDraft] = useState<Draft>({});
  const { run, busy } = useAction();

  const original = useMemo<Draft>(() => {
    const d: Draft = {};
    data?.roles.forEach((r) => (d[r.id] = data.direct.filter((x) => x.role_id === r.id).map((x) => x.permission_code)));
    return d;
  }, [data]);
  useEffect(() => setDraft(original), [original]);

  const roleById = new Map(data?.roles.map((r) => [r.id, r]) ?? []);
  // Quyền thực tế theo bản nháp = quyền riêng ∪ quyền thực tế của vai trò cha
  const effectiveOf = (roleId: number | null, seen = new Set<number>()): Set<string> => {
    if (roleId === null || seen.has(roleId)) return new Set();
    seen.add(roleId);
    const role = roleById.get(roleId);
    return new Set([...(draft[roleId] ?? []), ...effectiveOf(role?.parent_role_id ?? null, seen)]);
  };

  const isDirty = (roleId: number) =>
    [...(draft[roleId] ?? [])].sort().join() !== [...(original[roleId] ?? [])].sort().join();

  function toggle(roleId: number, code: string) {
    setDraft((d) => {
      const cur = d[roleId] ?? [];
      return { ...d, [roleId]: cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code] };
    });
  }

  async function save(roleId: number) {
    const ok = await run(
      () => api.put(`/admin/roles/${roleId}/permissions`, { permission_codes: draft[roleId] ?? [] }),
      'Đã lưu phân quyền — có hiệu lực ngay từ thao tác kế tiếp của nhân viên',
    );
    if (ok) reload();
  }

  const modules = data ? [...new Set(data.permissions.map((p) => p.module))] : [];

  return (
    <AsyncBoundary loading={loading && !data} error={error}>
      {data && (
        <>
          <div className="mb-4">
            <Alert kind="info">
              Quyền đặt theo mã use case. Vai trò có vai trò cha (Quản lý kế thừa Lễ tân) tự có mọi quyền của vai trò cha —
              các ô này được đánh dấu sẵn và khóa. Thay đổi có hiệu lực ngay từ thao tác kế tiếp của nhân viên, không cần đăng nhập lại.
            </Alert>
          </div>
          <Card bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Chức năng
                    </th>
                    {data.roles.map((r) => (
                      <th key={r.id} className="min-w-36 px-3 py-2 text-center">
                        <div className="text-sm font-semibold text-slate-800">{r.name}</div>
                        <div className="text-xs font-normal text-slate-500">
                          {r.staff_count} nhân viên{r.parent_name && ` · kế thừa ${r.parent_name}`}
                        </div>
                        <div className="mt-1 flex justify-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!isDirty(r.id) || busy}
                            onClick={() => setDraft((d) => ({ ...d, [r.id]: original[r.id] ?? [] }))}
                            title="Hoàn tác"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" disabled={!isDirty(r.id)} loading={busy && isDirty(r.id)} onClick={() => save(r.id)}>
                            <Save className="h-3.5 w-3.5" /> Lưu
                          </Button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {modules.map((m) => (
                    <Fragment key={m}>
                      <tr className="bg-slate-50/60">
                        <td colSpan={data.roles.length + 1} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-teal-700">
                          {MODULES[m] ?? m}
                        </td>
                      </tr>
                      {data.permissions
                        .filter((p) => p.module === m)
                        .map((p) => (
                          <tr key={p.code} className="hover:bg-slate-50">
                            <td className="px-3 py-1.5">
                              <span className="mr-2 font-mono text-xs text-slate-500">{p.code}</span>
                              {p.name}
                            </td>
                            {data.roles.map((r) => {
                              const inherited = effectiveOf(r.parent_role_id).has(p.code);
                              const checked = inherited || (draft[r.id] ?? []).includes(p.code);
                              const changed = (draft[r.id] ?? []).includes(p.code) !== (original[r.id] ?? []).includes(p.code);
                              return (
                                <td key={r.id} className={cn('px-3 py-1.5 text-center', changed && 'bg-amber-50')}>
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-teal-600 disabled:opacity-50"
                                    checked={checked}
                                    disabled={inherited}
                                    title={inherited ? `Kế thừa từ ${r.parent_name}` : undefined}
                                    onChange={() => toggle(r.id, p.code)}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </AsyncBoundary>
  );
}
