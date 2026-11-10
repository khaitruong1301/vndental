'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Input, Select } from '@/components/ui';
import { useLookups } from '@/lib/auth';
import { fmtMoney, fmtNumber } from '@/lib/format';
import { newKey } from './types';

export interface RxDraft {
  key: string;
  id?: number;
  item_id: number | null;
  medicine_name: string;
  dosage: string;
  quantity: string;
  unit: string;
  is_external: boolean;
  note: string;
}

/** DT-03: thuốc phát tại phòng khám (trừ kho, tính tiền) hoặc thuốc mua ngoài */
export function PrescriptionsEditor({
  value,
  onChange,
  readOnly,
  saved = [],
}: {
  value: RxDraft[];
  onChange: (rows: RxDraft[]) => void;
  readOnly: boolean;
  /** Đơn thuốc đã lưu: số lượng đã trừ kho của dòng cũ được cộng lại khi so tồn */
  saved?: { id: number; item_id: number | null; quantity: number; is_external: boolean }[];
}) {
  const { items } = useLookups();
  const medicines = items.filter((i) => i.item_type === 'MEDICINE');

  function update(key: string, patch: Partial<RxDraft>) {
    onChange(value.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function chooseMedicine(row: RxDraft, itemId: number | null) {
    const med = medicines.find((m) => m.id === itemId);
    update(row.key, {
      item_id: itemId,
      medicine_name: med?.name ?? '',
      unit: med?.unit ?? '',
      dosage: row.dosage || med?.default_dosage || '',
    });
  }

  function add(external: boolean) {
    onChange([
      ...value,
      { key: newKey(), item_id: null, medicine_name: '', dosage: '', quantity: '1', unit: external ? 'hộp' : '', is_external: external, note: '' },
    ]);
  }

  if (readOnly && value.length === 0) return <p className="text-sm text-slate-500">Không kê đơn thuốc.</p>;

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-2 text-left">Thuốc</th>
                <th className="px-2 py-2 text-left">Liều dùng</th>
                <th className="px-2 py-2 text-right">Số lượng</th>
                <th className="px-2 py-2 text-left">Ghi chú</th>
                {!readOnly && <th />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {value.map((r) => {
                const med = medicines.find((m) => m.id === r.item_id);
                const prev = r.id ? saved.find((s) => s.id === r.id && s.item_id === r.item_id && !s.is_external) : undefined;
                const available = med ? med.current_stock + (prev ? Number(prev.quantity) : 0) : 0;
                const short = !r.is_external && med && Number(r.quantity) > available;
                return (
                  <tr key={r.key} className="align-top">
                    <td className="min-w-64 px-2 py-2">
                      {r.is_external ? (
                        <>
                          {readOnly ? (
                            <span>{r.medicine_name}</span>
                          ) : (
                            <Input placeholder="Tên thuốc mua ngoài" value={r.medicine_name} onChange={(e) => update(r.key, { medicine_name: e.target.value })} />
                          )}
                          <div className="mt-1">
                            <Badge color="orange">Mua ngoài · không trừ kho, không tính tiền</Badge>
                          </div>
                        </>
                      ) : readOnly ? (
                        <span>{r.medicine_name}</span>
                      ) : (
                        <Select value={r.item_id ?? ''} onChange={(e) => chooseMedicine(r, e.target.value ? Number(e.target.value) : null)}>
                          <option value="">— Chọn thuốc trong kho —</option>
                          {medicines.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} · tồn {fmtNumber(m.current_stock)} {m.unit} · {fmtMoney(m.current_price)}
                            </option>
                          ))}
                        </Select>
                      )}
                    </td>
                    <td className="min-w-56 px-2 py-2">
                      {readOnly ? r.dosage : <Input placeholder="VD: Uống 1 viên x 2 lần/ngày" value={r.dosage} onChange={(e) => update(r.key, { dosage: e.target.value })} />}
                    </td>
                    <td className="w-36 px-2 py-2 text-right">
                      {readOnly ? (
                        `${fmtNumber(r.quantity)} ${r.unit}`
                      ) : (
                        <div className="flex items-center gap-1">
                          <Input type="number" min={1} className="text-right" value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} />
                          {r.is_external ? (
                            <Input className="w-16" value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value })} />
                          ) : (
                            <span className="text-xs text-slate-500">{r.unit}</span>
                          )}
                        </div>
                      )}
                      {short && <div className="mt-1 text-xs text-red-600">Vượt tồn kho ({fmtNumber(available)})</div>}
                    </td>
                    <td className="min-w-40 px-2 py-2">
                      {readOnly ? r.note || '—' : <Input value={r.note} onChange={(e) => update(r.key, { note: e.target.value })} />}
                    </td>
                    {!readOnly && (
                      <td className="px-2 py-2 text-right">
                        <Button variant="ghost" size="sm" title="Xóa thuốc" onClick={() => onChange(value.filter((x) => x.key !== r.key))}>
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
      )}
      {!readOnly && (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => add(false)}>
            <Plus className="h-4 w-4" /> Thuốc trong kho
          </Button>
          <Button variant="secondary" size="sm" onClick={() => add(true)}>
            <Plus className="h-4 w-4" /> Thuốc mua ngoài
          </Button>
        </div>
      )}
    </div>
  );
}
