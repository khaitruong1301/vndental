'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, DataTable, Field, Input, Modal } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction } from '@/lib/hooks';
import { type Guardian, type GuardianInput, RELATIONSHIPS } from './types';

const EMPTY: GuardianInput = { full_name: '', relationship: 'Mẹ', phone: '', is_primary: false, note: '' };

/** BN-03 / BN-04: danh sách người giám hộ, thêm / sửa / xóa qua modal */
export function GuardiansSection({
  patientId,
  guardians,
  under15,
  onChanged,
}: {
  patientId: number;
  guardians: Guardian[];
  under15: boolean;
  onChanged: () => void;
}) {
  const { can } = useAuth();
  const canEdit = can('BN-03', 'BN-04');
  const { run, busy } = useAction();
  const [editing, setEditing] = useState<{ id: number | null; values: GuardianInput } | null>(null);
  const valid =
    !!editing &&
    editing.values.full_name.trim() !== '' &&
    editing.values.relationship.trim() !== '' &&
    /^[0-9+ .-]{6,20}$/.test(editing.values.phone);

  async function save() {
    if (!editing) return;
    const body = { ...editing.values, note: editing.values.note.trim() || null };
    const ok = await run(
      () =>
        editing.id
          ? api.put(`/patients/${patientId}/guardians/${editing.id}`, body)
          : api.post(`/patients/${patientId}/guardians`, body),
      'Đã lưu người giám hộ',
    );
    if (ok) {
      setEditing(null);
      onChanged();
    }
  }

  async function remove(g: Guardian) {
    if (!window.confirm(`Xóa người giám hộ ${g.full_name}?`)) return;
    const ok = await run(() => api.del(`/patients/${patientId}/guardians/${g.id}`), 'Đã xóa người giám hộ');
    if (ok) onChanged();
  }

  return (
    <Card
      title={under15 ? 'Người giám hộ (bắt buộc — bệnh nhân dưới 15 tuổi)' : 'Người giám hộ'}
      bodyClassName="p-0"
      actions={
        canEdit && (
          <Button size="sm" variant="secondary" onClick={() => setEditing({ id: null, values: { ...EMPTY, is_primary: guardians.length === 0 } })}>
            <Plus className="h-3.5 w-3.5" /> Thêm
          </Button>
        )
      }
    >
      <DataTable
        rows={guardians}
        rowKey={(g) => g.id}
        empty={under15 ? 'Chưa có người giám hộ — cần bổ sung' : 'Không có người giám hộ'}
        columns={[
          {
            key: 'name',
            header: 'Họ tên',
            render: (g) => (
              <span className="font-medium">
                {g.full_name} {g.is_primary && <Badge color="teal">Liên hệ chính</Badge>}
              </span>
            ),
          },
          { key: 'rel', header: 'Quan hệ', render: (g) => g.relationship },
          { key: 'phone', header: 'SĐT', render: (g) => g.phone },
          { key: 'note', header: 'Ghi chú', render: (g) => g.note ?? '—' },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (g) =>
              canEdit && (
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Sửa"
                    onClick={() =>
                      setEditing({
                        id: g.id,
                        values: { full_name: g.full_name, relationship: g.relationship, phone: g.phone, is_primary: g.is_primary, note: g.note ?? '' },
                      })
                    }
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Xóa" disabled={busy} onClick={() => remove(g)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ),
          },
        ]}
      />

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Sửa người giám hộ' : 'Thêm người giám hộ'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Hủy
            </Button>
            <Button loading={busy} disabled={!valid} onClick={save}>
              Lưu
            </Button>
          </>
        }
      >
        {editing && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Họ tên" required className="sm:col-span-2">
              <Input
                autoFocus
                value={editing.values.full_name}
                onChange={(e) => setEditing({ ...editing, values: { ...editing.values, full_name: e.target.value } })}
              />
            </Field>
            <Field label="Quan hệ" required>
              <Input
                list="guardian-rel-options"
                value={editing.values.relationship}
                onChange={(e) => setEditing({ ...editing, values: { ...editing.values, relationship: e.target.value } })}
              />
              <datalist id="guardian-rel-options">
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </Field>
            <Field label="SĐT" required>
              <Input
                inputMode="tel"
                value={editing.values.phone}
                onChange={(e) => setEditing({ ...editing, values: { ...editing.values, phone: e.target.value } })}
              />
            </Field>
            <Field label="Ghi chú" className="sm:col-span-2">
              <Input
                value={editing.values.note}
                onChange={(e) => setEditing({ ...editing, values: { ...editing.values, note: e.target.value } })}
              />
            </Field>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-teal-600"
                checked={editing.values.is_primary}
                onChange={(e) => setEditing({ ...editing, values: { ...editing.values, is_primary: e.target.checked } })}
              />
              Liên hệ chính
            </label>
          </div>
        )}
      </Modal>
    </Card>
  );
}
