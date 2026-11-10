'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Alert, Button, Input } from '@/components/ui';
import { fmtMoney } from '@/lib/format';
import { type InstallmentDraft, newKey } from './types';

/** Kế hoạch các đợt thanh toán liệu trình; tổng các đợt phải bằng tổng giá */
export function InstallmentsEditor({
  value,
  onChange,
  totalPrice,
}: {
  value: InstallmentDraft[];
  onChange: (rows: InstallmentDraft[]) => void;
  totalPrice: number;
}) {
  const sum = value.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const diff = totalPrice - sum;

  function update(key: string, patch: Partial<InstallmentDraft>) {
    onChange(value.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function renumber(rows: InstallmentDraft[]) {
    // Đợt đã có lần thu giữ nguyên số thứ tự; các đợt khác đánh số tiếp theo
    const used = new Set(rows.filter((r) => r.paid_amount).map((r) => r.installment_no));
    let n = 1;
    return rows.map((r) => {
      if (r.paid_amount) return r;
      while (used.has(n)) n += 1;
      const row = { ...r, installment_no: n };
      used.add(n);
      return row;
    });
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-2 py-1.5 text-left">Đợt</th>
              <th className="px-2 py-1.5 text-left">Hạn thanh toán</th>
              <th className="px-2 py-1.5 text-right">Số tiền</th>
              <th className="px-2 py-1.5 text-left">Ghi chú</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {value.map((r) => {
              const locked = !!r.paid_amount;
              return (
                <tr key={r.key}>
                  <td className="px-2 py-1.5 font-medium">{r.installment_no}</td>
                  <td className="px-2 py-1.5">
                    <Input type="date" value={r.due_date} onChange={(e) => update(r.key, { due_date: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      min={0}
                      step={1000}
                      className="text-right"
                      disabled={locked}
                      value={r.amount}
                      onChange={(e) => update(r.key, { amount: e.target.value })}
                    />
                    {locked && <div className="mt-0.5 text-xs text-emerald-700">Đã thu {fmtMoney(r.paid_amount)}</div>}
                  </td>
                  <td className="px-2 py-1.5">
                    <Input value={r.note} onChange={(e) => update(r.key, { note: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={locked}
                      title={locked ? 'Đợt đã có lần thu' : 'Xóa đợt'}
                      onClick={() => onChange(renumber(value.filter((x) => x.key !== r.key)))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            onChange(
              renumber([
                ...value,
                { key: newKey(), installment_no: 0, due_date: '', amount: diff > 0 ? String(diff) : '', note: '' },
              ]),
            )
          }
        >
          <Plus className="h-4 w-4" /> Thêm đợt
        </Button>
        <span className="text-sm text-slate-600">
          Tổng các đợt: <b>{fmtMoney(sum)}</b> / {fmtMoney(totalPrice)}
        </span>
      </div>
      {value.length > 0 && Math.abs(diff) > 0.001 && (
        <Alert kind="warning">
          {diff > 0 ? `Còn thiếu ${fmtMoney(diff)} so với tổng giá liệu trình` : `Vượt ${fmtMoney(-diff)} so với tổng giá liệu trình`}
        </Alert>
      )}
    </div>
  );
}

export function installmentsPayload(rows: InstallmentDraft[]) {
  return rows.map((r) => ({
    id: r.id ?? null,
    installment_no: r.installment_no,
    due_date: r.due_date || null,
    amount: Number(r.amount) || 0,
    note: r.note,
  }));
}

export function installmentsValid(rows: InstallmentDraft[], totalPrice: number) {
  const sum = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return rows.length > 0 && rows.every((r) => Number(r.amount) > 0) && Math.abs(sum - totalPrice) < 0.001;
}
