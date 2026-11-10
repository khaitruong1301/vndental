'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Input, Select } from '@/components/ui';
import { useLookups } from '@/lib/auth';
import { fmtMoney } from '@/lib/format';
import { toothLabel } from '@/lib/labels';
import { ToothPicker } from './ToothPicker';
import { newKey, type ToothScope } from './types';

export interface ItemDraft {
  key: string;
  id?: number;
  service_id: number | null;
  tooth_code: string;
  performing_doctor_id: number;
  quantity: string;
  is_plan_package: boolean;
  note: string;
}

const JAW = ['FULL', 'UPPER', 'LOWER'];

/** DT-02: mỗi dòng = dịch vụ + số răng + bác sĩ thực hiện (mục 6.1 hai bác sĩ cùng làm) */
export function ItemsEditor({
  value,
  onChange,
  readOnly,
  primaryDoctorId,
  planServiceId,
  planLinked,
}: {
  value: ItemDraft[];
  onChange: (rows: ItemDraft[]) => void;
  readOnly: boolean;
  primaryDoctorId: number;
  planServiceId: number | null;
  planLinked: boolean;
}) {
  const { services, doctors } = useLookups();
  const [pickerKey, setPickerKey] = useState<string | null>(null);
  const pickerRow = value.find((r) => r.key === pickerKey);
  const scopeOf = (serviceId: number | null): ToothScope =>
    services.find((s) => s.id === serviceId)?.tooth_scope ?? 'ANY';

  function update(key: string, patch: Partial<ItemDraft>) {
    onChange(value.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function changeService(row: ItemDraft, serviceId: number | null) {
    const scope = scopeOf(serviceId);
    let tooth = row.tooth_code;
    if (scope === 'JAW' && tooth && !JAW.includes(tooth)) tooth = 'FULL';
    if (scope === 'TOOTH' && JAW.includes(tooth)) tooth = '';
    if (scope === 'JAW' && !tooth) tooth = 'FULL';
    update(row.key, {
      service_id: serviceId,
      tooth_code: tooth,
      is_plan_package: planLinked && serviceId !== null && serviceId === planServiceId,
    });
  }

  function addRow() {
    onChange([
      ...value,
      {
        key: newKey(),
        service_id: null,
        tooth_code: '',
        performing_doctor_id: primaryDoctorId,
        quantity: '1',
        is_plan_package: false,
        note: '',
      },
    ]);
  }

  // Chọn nhiều răng → dòng hiện tại lấy răng đầu, mỗi răng còn lại thành một dòng mới
  function applyTeeth(codes: string[]) {
    if (!pickerRow) return;
    const idx = value.findIndex((r) => r.key === pickerRow.key);
    const [first, ...rest] = codes;
    const extra = rest.map((code) => ({ ...pickerRow, key: newKey(), id: undefined, tooth_code: code }));
    const next = [...value];
    next.splice(idx, 1, { ...pickerRow, tooth_code: first }, ...extra);
    onChange(next);
    setPickerKey(null);
  }

  const categories = [...new Set(services.map((s) => s.category ?? 'Khác'))];

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Dịch vụ</th>
              <th className="px-2 py-2 text-left">Răng / hàm</th>
              <th className="px-2 py-2 text-left">Bác sĩ thực hiện</th>
              <th className="px-2 py-2 text-right">SL</th>
              <th className="px-2 py-2 text-right">Đơn giá hiện hành</th>
              <th className="px-2 py-2 text-left">Ghi chú</th>
              {!readOnly && <th />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {value.length === 0 && (
              <tr>
                <td colSpan={8} className="px-2 py-6 text-center text-slate-500">
                  Chưa có dòng dịch vụ nào
                </td>
              </tr>
            )}
            {value.map((r, i) => {
              const svc = services.find((s) => s.id === r.service_id);
              return (
                <tr key={r.key} className="align-top">
                  <td className="px-2 py-2 text-slate-500">{i + 1}</td>
                  <td className="min-w-56 px-2 py-2">
                    {readOnly ? (
                      svc?.name ?? `#${r.service_id}`
                    ) : (
                      <Select value={r.service_id ?? ''} onChange={(e) => changeService(r, e.target.value ? Number(e.target.value) : null)}>
                        <option value="">— Chọn dịch vụ —</option>
                        {categories.map((c) => (
                          <optgroup key={c} label={c}>
                            {services
                              .filter((s) => (s.category ?? 'Khác') === c)
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                          </optgroup>
                        ))}
                      </Select>
                    )}
                    {r.is_plan_package && (
                      <div className="mt-1">
                        <Badge color="purple">Trọn gói liệu trình</Badge>
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {readOnly ? (
                      toothLabel(r.tooth_code)
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!r.service_id}
                        onClick={() => setPickerKey(r.key)}
                        className={r.tooth_code ? '' : 'border-amber-400 text-amber-700'}
                      >
                        {r.tooth_code ? toothLabel(r.tooth_code) : 'Chọn răng'}
                      </Button>
                    )}
                  </td>
                  <td className="min-w-44 px-2 py-2">
                    {readOnly ? (
                      doctors.find((d) => d.id === r.performing_doctor_id)?.full_name ?? `#${r.performing_doctor_id}`
                    ) : (
                      <Select value={r.performing_doctor_id} onChange={(e) => update(r.key, { performing_doctor_id: Number(e.target.value) })}>
                        {doctors.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.full_name}
                            {d.id === primaryDoctorId ? ' (BS chính)' : ''}
                          </option>
                        ))}
                      </Select>
                    )}
                  </td>
                  <td className="w-20 px-2 py-2 text-right">
                    {readOnly ? (
                      r.quantity
                    ) : (
                      <Input type="number" min={1} step={1} className="text-right" value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    {r.is_plan_package ? (
                      <span className="text-slate-500">0 đ</span>
                    ) : (
                      fmtMoney(svc?.current_price ?? null)
                    )}
                    {!readOnly && planLinked && (
                      <label className="mt-1 flex items-center justify-end gap-1 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          className="accent-teal-600"
                          checked={r.is_plan_package}
                          onChange={(e) => update(r.key, { is_plan_package: e.target.checked })}
                        />
                        Trọn gói
                      </label>
                    )}
                  </td>
                  <td className="min-w-40 px-2 py-2">
                    {readOnly ? r.note || '—' : <Input value={r.note} onChange={(e) => update(r.key, { note: e.target.value })} />}
                  </td>
                  {!readOnly && (
                    <td className="px-2 py-2 text-right">
                      <Button variant="ghost" size="sm" title="Xóa dòng" onClick={() => onChange(value.filter((x) => x.key !== r.key))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <Button variant="secondary" size="sm" onClick={addRow}>
          <Plus className="h-4 w-4" /> Thêm dòng dịch vụ
        </Button>
      )}
      <ToothPicker
        open={!!pickerRow}
        onClose={() => setPickerKey(null)}
        scope={scopeOf(pickerRow?.service_id ?? null)}
        initial={pickerRow?.tooth_code ? [pickerRow.tooth_code] : []}
        multiple={!pickerRow?.id}
        onConfirm={applyTeeth}
      />
    </div>
  );
}
