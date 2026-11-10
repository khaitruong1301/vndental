'use client';

import { type FormEvent, useMemo, useState } from 'react';
import { Pencil, Plus, Power, Search } from 'lucide-react';
import {
  AsyncBoundary,
  Badge,
  Button,
  Card,
  Checkbox,
  type Column,
  DataTable,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  cn,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAction, useApi } from '@/lib/hooks';

export interface FieldDef {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'textarea' | 'select' | 'checkbox';
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  min?: number;
  step?: number;
  /** Chiếm cả 2 cột trong form */
  wide?: boolean;
}

export type FormValues = Record<string, string | boolean>;

interface CatalogRow {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
}

/** Bảng danh mục QT-03: tìm kiếm, tạo/sửa bằng modal, ngừng/dùng lại (không xóa cứng) */
export function CatalogEditor<T extends CatalogRow>({
  path,
  entityLabel,
  columns,
  fields,
  emptyForm,
  onChanged,
}: {
  /** Đoạn sau /admin/catalog/ — vd. 'services', 'cancel-reasons' */
  path: string;
  /** Tên thực thể viết thường, vd. 'dịch vụ' */
  entityLabel: string;
  columns: Column<T>[];
  fields: FieldDef[];
  emptyForm: FormValues;
  onChanged?: () => void;
}) {
  const { data, loading, error, reload } = useApi<T[]>(`/admin/catalog/${path}`);
  const [keyword, setKeyword] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [editing, setEditing] = useState<{ id: number | null; values: FormValues } | null>(null);
  const { run, busy } = useAction();

  const rows = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return (data ?? []).filter(
      (r) =>
        (showInactive || r.is_active) &&
        (!k || r.code.toLowerCase().includes(k) || r.name.toLowerCase().includes(k)),
    );
  }, [data, keyword, showInactive]);

  function openEdit(row: T) {
    const values: FormValues = {};
    for (const f of fields) {
      const v = (row as unknown as Record<string, unknown>)[f.name];
      values[f.name] = f.type === 'checkbox' ? Boolean(v) : v === null || v === undefined ? '' : String(v);
    }
    setEditing({ id: row.id, values });
  }

  async function toggleActive(row: T) {
    const next = !row.is_active;
    if (!next && !window.confirm(`Ngừng sử dụng ${entityLabel} "${row.name}"? Dữ liệu cũ vẫn được giữ.`)) return;
    const ok = await run(
      () => api.patch(`/admin/catalog/${path}/${row.id}/active`, { is_active: next }),
      next ? 'Đã sử dụng lại' : 'Đã ngừng sử dụng',
    );
    if (ok) {
      reload();
      onChanged?.();
    }
  }

  const allColumns: Column<T>[] = [
    ...columns,
    {
      key: 'active',
      header: 'Trạng thái',
      render: (r) => (r.is_active ? <Badge color="green">Đang dùng</Badge> : <Badge>Ngừng dùng</Badge>),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => openEdit(r)}>
            <Pencil className="h-3.5 w-3.5" /> Sửa
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => toggleActive(r)}>
            <Power className={cn('h-3.5 w-3.5', r.is_active ? 'text-red-600' : 'text-emerald-600')} />
            {r.is_active ? 'Ngừng' : 'Dùng lại'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Card
        bodyClassName="p-0"
        title={
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                className="w-64 pl-8"
                placeholder="Tìm theo mã hoặc tên..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <Checkbox label="Hiện mục ngừng dùng" checked={showInactive} onChange={setShowInactive} />
          </div>
        }
        actions={
          <Button onClick={() => setEditing({ id: null, values: { ...emptyForm } })}>
            <Plus className="h-4 w-4" /> Thêm {entityLabel}
          </Button>
        }
      >
        <AsyncBoundary loading={loading && !data} error={error}>
          <DataTable rows={rows} rowKey={(r) => r.id} columns={allColumns} empty={`Chưa có ${entityLabel}`} />
        </AsyncBoundary>
      </Card>

      {editing && (
        <CatalogFormModal
          title={editing.id ? `Sửa ${entityLabel}` : `Thêm ${entityLabel}`}
          fields={fields}
          initial={editing.values}
          onClose={() => setEditing(null)}
          onSubmit={async (payload) => {
            const ok = await run(
              () =>
                editing.id
                  ? api.put(`/admin/catalog/${path}/${editing.id}`, payload)
                  : api.post(`/admin/catalog/${path}`, payload),
              editing.id ? 'Đã cập nhật' : `Đã thêm ${entityLabel}`,
            );
            if (ok) {
              setEditing(null);
              reload();
              onChanged?.();
            }
          }}
          busy={busy}
        />
      )}
    </>
  );
}

function CatalogFormModal({
  title,
  fields,
  initial,
  onClose,
  onSubmit,
  busy,
}: {
  title: string;
  fields: FieldDef[];
  initial: FormValues;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const [values, setValues] = useState<FormValues>(initial);
  const set = (name: string, value: string | boolean) => setValues((v) => ({ ...v, [name]: value }));
  const missing = fields.some((f) => f.required && f.type !== 'checkbox' && String(values[f.name] ?? '').trim() === '');

  function submit(e: FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const v = values[f.name];
      payload[f.name] = f.type === 'checkbox' ? Boolean(v) : f.type === 'number' ? Number(v || 0) : String(v ?? '');
    }
    onSubmit(payload);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" form="catalog-form" loading={busy} disabled={missing}>
            Lưu
          </Button>
        </>
      }
    >
      <form id="catalog-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((f) =>
          f.type === 'checkbox' ? (
            <div key={f.name} className={cn('flex items-end pb-2', f.wide && 'sm:col-span-2')}>
              <Checkbox label={f.label} checked={Boolean(values[f.name])} onChange={(c) => set(f.name, c)} />
            </div>
          ) : (
            <Field
              key={f.name}
              label={f.label}
              required={f.required}
              hint={f.hint}
              className={cn((f.wide || f.type === 'textarea') && 'sm:col-span-2')}
            >
              {f.type === 'select' ? (
                <Select value={String(values[f.name] ?? '')} onChange={(e) => set(f.name, e.target.value)}>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : f.type === 'textarea' ? (
                <Textarea rows={2} value={String(values[f.name] ?? '')} onChange={(e) => set(f.name, e.target.value)} />
              ) : (
                <Input
                  type={f.type === 'number' ? 'number' : 'text'}
                  min={f.min}
                  step={f.step}
                  value={String(values[f.name] ?? '')}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              )}
            </Field>
          ),
        )}
      </form>
    </Modal>
  );
}
