'use client';

import { type FormEvent, useMemo, useState } from 'react';
import { ClipboardCheck, PackagePlus, Plus, Trash2 } from 'lucide-react';
import { Alert, Button, Card, Field, Input, Select, Textarea, cn } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtMoney, fmtNumber } from '@/lib/format';
import { useAction } from '@/lib/hooks';

export interface InventoryRow {
  id: number;
  code: string;
  name: string;
  item_type: 'SUPPLY' | 'MEDICINE';
  unit: string;
  current_stock: number;
  min_stock: number;
  is_active: boolean;
  low_stock: boolean;
  below_threshold: boolean;
  last_import_at: string | null;
  current_price: number | null;
}

interface ImportLine {
  item_id: string;
  quantity: string;
  unit_cost: string;
  supplier: string;
  batch_no: string;
  expiry_date: string;
}

const emptyLine = (): ImportLine => ({ item_id: '', quantity: '', unit_cost: '', supplier: '', batch_no: '', expiry_date: '' });

/** QT-04: phiếu nhập kho nhiều dòng → mỗi dòng 1 phát sinh IMPORT */
export function ImportForm({ items, onDone }: { items: InventoryRow[]; onDone: () => void }) {
  const [lines, setLines] = useState<ImportLine[]>([emptyLine()]);
  const [note, setNote] = useState('');
  const { run, busy } = useAction();
  const active = items.filter((i) => i.is_active);
  const byId = new Map(items.map((i) => [String(i.id), i]));
  const valid = lines.length > 0 && lines.every((l) => l.item_id && Number(l.quantity) > 0);
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0);
  const update = (i: number, patch: Partial<ImportLine>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await run(
      () =>
        api.post('/admin/inventory/import', {
          note,
          lines: lines.map((l) => ({
            item_id: Number(l.item_id),
            quantity: Number(l.quantity),
            unit_cost: l.unit_cost,
            supplier: l.supplier,
            batch_no: l.batch_no,
            expiry_date: l.expiry_date,
          })),
        }),
      'Đã nhập kho',
    );
    if (ok) {
      setLines([emptyLine()]);
      setNote('');
      onDone();
    }
  }

  return (
    <Card title="Phiếu nhập kho">
      <form onSubmit={submit} className="space-y-3">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-1 py-1">Mặt hàng</th>
                <th className="px-1 py-1">Số lượng</th>
                <th className="px-1 py-1">Đơn giá nhập</th>
                <th className="px-1 py-1">Nhà cung cấp</th>
                <th className="px-1 py-1">Số lô</th>
                <th className="px-1 py-1">Hạn dùng</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="min-w-56 px-1 py-1">
                    <Select value={l.item_id} onChange={(e) => update(i, { item_id: e.target.value })}>
                      <option value="">— Chọn —</option>
                      {active.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name} ({it.code}) · tồn {fmtNumber(it.current_stock)} {it.unit}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="w-28 px-1 py-1">
                    <div className="flex items-center gap-1">
                      <Input type="number" min={0} step="any" value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
                      <span className="text-xs text-slate-500">{byId.get(l.item_id)?.unit}</span>
                    </div>
                  </td>
                  <td className="w-32 px-1 py-1">
                    <Input type="number" min={0} step={1} value={l.unit_cost} onChange={(e) => update(i, { unit_cost: e.target.value })} />
                  </td>
                  <td className="min-w-40 px-1 py-1">
                    <Input value={l.supplier} onChange={(e) => update(i, { supplier: e.target.value })} />
                  </td>
                  <td className="w-28 px-1 py-1">
                    <Input value={l.batch_no} onChange={(e) => update(i, { batch_no: e.target.value })} />
                  </td>
                  <td className="w-40 px-1 py-1">
                    <Input type="date" value={l.expiry_date} onChange={(e) => update(i, { expiry_date: e.target.value })} />
                  </td>
                  <td className="px-1 py-1">
                    <Button variant="ghost" size="sm" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="secondary" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
            <Plus className="h-3.5 w-3.5" /> Thêm dòng
          </Button>
          <span className="text-sm text-slate-600">
            Tổng giá trị nhập: <b>{fmtMoney(total)}</b>
          </span>
        </div>
        <Field label="Ghi chú phiếu nhập">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="vd. Nhập bổ sung tháng 11" />
        </Field>
        <Button type="submit" loading={busy} disabled={!valid}>
          <PackagePlus className="h-4 w-4" /> Lưu phiếu nhập
        </Button>
      </form>
    </Card>
  );
}

/** QT-04: kiểm kê — nhập số đếm thực tế, hệ thống ghi phát sinh STOCK_TAKE cho phần chênh lệch */
export function StockTakeForm({ items, onDone }: { items: InventoryRow[]; onDone: () => void }) {
  const [counted, setCounted] = useState<Record<number, string>>({});
  const [note, setNote] = useState('');
  const [type, setType] = useState('');
  const { run, busy } = useAction();
  const rows = items.filter((i) => i.is_active && (!type || i.item_type === type));

  const entered = useMemo(
    () => items.filter((i) => counted[i.id] !== undefined && counted[i.id] !== ''),
    [items, counted],
  );
  const diffs = entered.filter((i) => Number(counted[i.id]) !== i.current_stock);
  const invalid = entered.some((i) => Number(counted[i.id]) < 0);

  async function submit() {
    if (!window.confirm(`Ghi nhận kiểm kê ${entered.length} mặt hàng, trong đó ${diffs.length} mặt hàng lệch so với hệ thống?`)) return;
    const ok = await run(
      () =>
        api.post<{ adjusted: number }>('/admin/inventory/stock-take', {
          note,
          lines: entered.map((i) => ({ item_id: i.id, counted_quantity: Number(counted[i.id]) })),
        }),
      'Đã ghi nhận kiểm kê',
    );
    if (ok) {
      setCounted({});
      setNote('');
      onDone();
    }
  }

  return (
    <Card
      title="Kiểm kê kho"
      actions={
        <Select className="w-40" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Tất cả</option>
          <option value="SUPPLY">Vật tư</option>
          <option value="MEDICINE">Thuốc</option>
        </Select>
      }
    >
      <div className="space-y-3">
        <Alert kind="info">
          Chỉ nhập số đếm cho mặt hàng đã kiểm. Mặt hàng lệch sẽ được ghi phát sinh «Kiểm kê» bằng phần chênh lệch; sổ kho
          không bị sửa.
        </Alert>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Mặt hàng</th>
                <th className="px-3 py-2 text-right">Tồn hệ thống</th>
                <th className="px-3 py-2 text-right">Số đếm thực tế</th>
                <th className="px-3 py-2 text-right">Chênh lệch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((i) => {
                const value = counted[i.id] ?? '';
                const diff = value === '' ? null : Number(value) - i.current_stock;
                return (
                  <tr key={i.id}>
                    <td className="px-3 py-1.5">
                      <div className="font-medium">{i.name}</div>
                      <div className="text-xs text-slate-500">{i.code}</div>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {fmtNumber(i.current_stock)} {i.unit}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        className="ml-auto w-28 text-right"
                        value={value}
                        onChange={(e) => setCounted((c) => ({ ...c, [i.id]: e.target.value }))}
                      />
                    </td>
                    <td
                      className={cn(
                        'px-3 py-1.5 text-right font-medium',
                        diff === null || diff === 0 ? 'text-slate-400' : diff > 0 ? 'text-emerald-600' : 'text-red-600',
                      )}
                    >
                      {diff === null ? '—' : `${diff > 0 ? '+' : ''}${fmtNumber(diff)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Field label="Ghi chú kiểm kê">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="vd. Kiểm kê cuối tháng 11" />
        </Field>
        <div className="flex items-center gap-3">
          <Button loading={busy} disabled={!entered.length || invalid} onClick={submit}>
            <ClipboardCheck className="h-4 w-4" /> Ghi nhận kiểm kê
          </Button>
          <span className="text-sm text-slate-500">
            Đã nhập {entered.length} mặt hàng · {diffs.length} lệch
          </span>
        </div>
      </div>
    </Card>
  );
}
