'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Button, Card, Input, Select } from '@/components/ui';
import { useLookups } from '@/lib/auth';
import { fmtNumber } from '@/lib/format';
import type { RecordDetail } from './types';

export interface MaterialPayload {
  item_id: number;
  actual_quantity: number;
  note: string | null;
}

interface Row {
  item_id: number;
  name: string;
  unit: string;
  norm: number;
  actual: string;
  note: string;
  stock: number | null;
  min: number | null;
}

/** DT-06: vật tư trừ theo định mức khi lưu phiếu; bác sĩ chỉnh số thực dùng hoặc thêm vật tư phát sinh */
export function MaterialsCard({
  materials,
  readOnly,
  busy,
  onSave,
}: {
  materials: RecordDetail['materials'];
  readOnly: boolean;
  busy: boolean;
  onSave: (rows: MaterialPayload[]) => void;
}) {
  const { items } = useLookups();
  const [rows, setRows] = useState<Row[]>([]);
  const [extraId, setExtraId] = useState('');

  useEffect(() => {
    setRows(
      materials.map((m) => ({
        item_id: m.item_id,
        name: m.item_name,
        unit: m.unit,
        norm: m.norm_quantity,
        actual: String(m.actual_quantity),
        note: m.note ?? '',
        stock: m.current_stock,
        min: m.min_stock,
      })),
    );
  }, [materials]);

  const original = new Map(materials.map((m) => [m.item_id, m]));
  const dirty = rows.some((r) => {
    const o = original.get(r.item_id);
    return !o || Number(r.actual) !== o.actual_quantity || (r.note || null) !== (o.note || null);
  });

  function addExtra() {
    const item = items.find((i) => i.id === Number(extraId));
    if (!item || rows.some((r) => r.item_id === item.id)) return;
    setRows([...rows, { item_id: item.id, name: item.name, unit: item.unit, norm: 0, actual: '1', note: '', stock: item.current_stock, min: item.min_stock }]);
    setExtraId('');
  }

  return (
    <Card
      title="Vật tư sử dụng (trừ kho theo định mức)"
      actions={
        !readOnly && (
          <Button
            size="sm"
            loading={busy}
            disabled={!dirty || rows.some((r) => r.actual === '' || Number(r.actual) < 0)}
            onClick={() => onSave(rows.map((r) => ({ item_id: r.item_id, actual_quantity: Number(r.actual), note: r.note.trim() || null })))}
          >
            Lưu vật tư
          </Button>
        )
      }
      bodyClassName="p-0"
    >
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-500">Chưa có vật tư — lưu phiếu để hệ thống tính theo định mức dịch vụ.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Vật tư</th>
                <th className="px-3 py-2 text-right">Định mức</th>
                <th className="px-3 py-2 text-right">Thực dùng</th>
                <th className="px-3 py-2 text-right">Tồn kho</th>
                <th className="px-3 py-2 text-left">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const changed = Number(r.actual) !== r.norm;
                return (
                  <tr key={r.item_id}>
                    <td className="px-3 py-2">
                      {r.name}
                      {r.norm === 0 && (
                        <span className="ml-2">
                          <Badge color="orange">Phát sinh</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-500">
                      {fmtNumber(r.norm)} {r.unit}
                    </td>
                    <td className="w-36 px-3 py-2 text-right">
                      {readOnly ? (
                        <span className={changed ? 'font-medium text-amber-700' : ''}>
                          {fmtNumber(r.actual)} {r.unit}
                        </span>
                      ) : (
                        <Input
                          type="number"
                          min={0}
                          step="0.5"
                          className={changed ? 'border-amber-400 text-right' : 'text-right'}
                          value={r.actual}
                          onChange={(e) => setRows(rows.map((x) => (x.item_id === r.item_id ? { ...x, actual: e.target.value } : x)))}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={r.stock !== null && r.min !== null && r.stock < r.min ? 'font-medium text-red-600' : 'text-slate-600'}>
                        {fmtNumber(r.stock)}
                      </span>
                    </td>
                    <td className="min-w-40 px-3 py-2">
                      {readOnly ? (
                        r.note || '—'
                      ) : (
                        <Input value={r.note} placeholder={changed ? 'Lý do khác định mức' : ''} onChange={(e) => setRows(rows.map((x) => (x.item_id === r.item_id ? { ...x, note: e.target.value } : x)))} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3">
          <Select className="w-72" value={extraId} onChange={(e) => setExtraId(e.target.value)}>
            <option value="">— Thêm vật tư phát sinh —</option>
            {items
              .filter((i) => i.item_type === 'SUPPLY' && !rows.some((r) => r.item_id === i.id))
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} (tồn {fmtNumber(i.current_stock)} {i.unit})
                </option>
              ))}
          </Select>
          <Button variant="secondary" size="sm" disabled={!extraId} onClick={addExtra}>
            <Plus className="h-4 w-4" /> Thêm
          </Button>
          <span className="text-xs text-slate-500">Tồn kho dưới ngưỡng sẽ tự gửi cảnh báo tới Quản lý.</span>
        </div>
      )}
    </Card>
  );
}
