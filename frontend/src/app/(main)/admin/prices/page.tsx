'use client';

import { type FormEvent, useState } from 'react';
import { History, Plus, Trash2 } from 'lucide-react';
import {
  Alert,
  AsyncBoundary,
  Badge,
  Button,
  Card,
  DataTable,
  Field,
  Input,
  Modal,
  PageHeader,
  StatusBadge,
  Tabs,
  Textarea,
  cn,
} from '@/components/ui';
import { api } from '@/lib/api';
import { RequirePerm, useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtMoney, todayStr } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';
import { ITEM_TYPE, labelOf } from '@/lib/labels';

type Kind = 'services' | 'items';

interface PriceRow {
  id: number;
  code: string;
  name: string;
  unit: string;
  is_active: boolean;
  category: string | null;
  item_type: string | null;
  current_price: number | null;
  current_from: string | null;
  next_price_id: number | null;
  next_price: number | null;
  next_from: string | null;
}

interface PriceHistory {
  entity: { id: number; code: string; name: string; unit: string };
  prices: {
    id: number;
    price: number;
    effective_from: string;
    note: string | null;
    created_at: string;
    created_by_name: string | null;
    state: 'CURRENT' | 'FUTURE' | 'PAST';
  }[];
}

const STATE_LABEL = {
  CURRENT: { label: 'Đang áp dụng', color: 'green' },
  FUTURE: { label: 'Sắp áp dụng', color: 'blue' },
  PAST: { label: 'Đã thay thế', color: 'gray' },
} as const;

const FK: Record<Kind, string> = { services: 'service_id', items: 'item_id' };

export default function PricesPage() {
  return (
    <RequirePerm perms={['QT-02']}>
      <PriceBoard />
    </RequirePerm>
  );
}

function PriceBoard() {
  const [kind, setKind] = useState<Kind>('services');
  const { data, loading, error, reload } = useApi<PriceRow[]>(`/admin/prices/${kind}`);
  const [adding, setAdding] = useState<PriceRow | null>(null);
  const [history, setHistory] = useState<PriceRow | null>(null);
  const { reloadLookups } = useAuth();
  const { run, busy } = useAction();

  // Tab Thuốc chỉ hiện thuốc (vật tư tiêu hao không tính tiền trên hóa đơn)
  const rows = kind === 'items' ? data?.filter((r) => r.item_type === 'MEDICINE') : data;

  async function afterChange() {
    reload();
    await reloadLookups().catch(() => undefined);
  }

  async function removeNext(row: PriceRow) {
    if (!row.next_price_id) return;
    if (!window.confirm(`Xóa giá ${fmtMoney(row.next_price)} dự kiến áp dụng từ ${fmtDate(row.next_from)} của "${row.name}"?`))
      return;
    if (await run(() => api.del(`/admin/prices/${kind}/${row.next_price_id}`), 'Đã xóa giá sắp áp dụng')) afterChange();
  }

  return (
    <>
      <PageHeader title="Bảng giá" subtitle="QT-02 · Giá dịch vụ và giá bán thuốc theo ngày hiệu lực" />
      <div className="mb-4">
        <Alert kind="info">
          Giá mới được thêm với ngày hiệu lực, <b>không ghi đè giá cũ</b>. Hóa đơn đã lập giữ nguyên giá tại thời điểm
          lập (TT-02). Giá đã có hiệu lực không sửa/xóa được — chỉ xóa được giá chưa đến ngày áp dụng.
        </Alert>
      </div>
      <Tabs
        tabs={[
          { key: 'services', label: 'Dịch vụ' },
          { key: 'items', label: 'Thuốc' },
        ]}
        value={kind}
        onChange={setKind}
      />
      <Card bodyClassName="p-0">
        <AsyncBoundary loading={loading && !data} error={error}>
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={[
              {
                key: 'name',
                header: kind === 'services' ? 'Dịch vụ' : 'Thuốc',
                render: (r) => (
                  <div className={cn(!r.is_active && 'opacity-60')}>
                    <div className="font-medium text-slate-900">{r.name}</div>
                    <div className="text-xs text-slate-500">
                      {r.code} · {r.unit}
                      {!r.is_active && ' · Ngừng sử dụng'}
                    </div>
                  </div>
                ),
              },
              {
                key: 'group',
                header: kind === 'services' ? 'Nhóm' : 'Loại',
                render: (r) =>
                  kind === 'services' ? r.category ?? '—' : <StatusBadge label={labelOf(ITEM_TYPE, r.item_type)} />,
              },
              {
                key: 'current',
                header: 'Giá hiện hành',
                align: 'right',
                render: (r) =>
                  r.current_price === null ? (
                    <Badge color="red">Chưa có giá</Badge>
                  ) : (
                    <>
                      <div className="font-semibold">{fmtMoney(r.current_price)}</div>
                      <div className="text-xs text-slate-500">từ {fmtDate(r.current_from)}</div>
                    </>
                  ),
              },
              {
                key: 'next',
                header: 'Giá sắp áp dụng',
                align: 'right',
                render: (r) =>
                  r.next_price === null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <div className="flex items-center justify-end gap-2">
                      <div>
                        <div className="font-medium text-blue-700">{fmtMoney(r.next_price)}</div>
                        <div className="text-xs text-slate-500">từ {fmtDate(r.next_from)}</div>
                      </div>
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => removeNext(r)} title="Xóa giá sắp áp dụng">
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                      </Button>
                    </div>
                  ),
              },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (r) => (
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => setHistory(r)}>
                      <History className="h-3.5 w-3.5" /> Lịch sử
                    </Button>
                    <Button size="sm" onClick={() => setAdding(r)}>
                      <Plus className="h-3.5 w-3.5" /> Giá mới
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </AsyncBoundary>
      </Card>

      {adding && (
        <AddPriceModal
          kind={kind}
          row={adding}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setAdding(null);
            afterChange();
          }}
        />
      )}
      {history && (
        <HistoryModal
          kind={kind}
          row={history}
          onClose={() => setHistory(null)}
          onChanged={afterChange}
        />
      )}
    </>
  );
}

function AddPriceModal({
  kind,
  row,
  onClose,
  onSaved,
}: {
  kind: Kind;
  row: PriceRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = todayStr();
  const [price, setPrice] = useState(row.current_price !== null ? String(row.current_price) : '');
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [note, setNote] = useState('');
  const { run, busy } = useAction();
  const pastDate = effectiveFrom < today;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await run(
      () =>
        api.post(`/admin/prices/${kind}`, {
          [FK[kind]]: row.id,
          price: Number(price),
          effective_from: effectiveFrom,
          note,
        }),
      'Đã thêm giá mới',
    );
    if (ok) onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Thêm giá mới — ${row.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" form="add-price-form" loading={busy} disabled={price === '' || Number(price) < 0 || pastDate}>
            Lưu giá
          </Button>
        </>
      }
    >
      <form id="add-price-form" onSubmit={submit} className="space-y-4">
        <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Giá hiện hành: <b>{fmtMoney(row.current_price)}</b>
          {row.current_from && ` (từ ${fmtDate(row.current_from)})`} / {row.unit}
        </div>
        <Field label={`Giá mới (đ / ${row.unit})`} required>
          <Input type="number" min={0} step={1} value={price} onChange={(e) => setPrice(e.target.value)} autoFocus />
        </Field>
        <Field
          label="Ngày hiệu lực"
          required
          hint="Từ ngày này, hóa đơn mới lập sẽ dùng giá mới"
          error={pastDate ? 'Ngày hiệu lực không được ở quá khứ' : null}
        >
          <Input type="date" min={today} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        </Field>
        <Field label="Ghi chú">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lý do điều chỉnh giá..." />
        </Field>
      </form>
    </Modal>
  );
}

function HistoryModal({
  kind,
  row,
  onClose,
  onChanged,
}: {
  kind: Kind;
  row: PriceRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data, loading, error, reload } = useApi<PriceHistory>(`/admin/prices/${kind}/${row.id}/history`);
  const { run, busy } = useAction();

  async function remove(id: number) {
    if (!window.confirm('Xóa giá chưa đến ngày áp dụng này?')) return;
    if (await run(() => api.del(`/admin/prices/${kind}/${id}`), 'Đã xóa giá')) {
      reload();
      onChanged();
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" title={`Lịch sử giá — ${row.name}`}>
      <AsyncBoundary loading={loading && !data} error={error}>
        <DataTable
          rows={data?.prices}
          rowKey={(p) => p.id}
          empty="Chưa có giá nào"
          columns={[
            { key: 'from', header: 'Hiệu lực từ', render: (p) => fmtDate(p.effective_from) },
            { key: 'price', header: 'Giá', align: 'right', render: (p) => <b>{fmtMoney(p.price)}</b> },
            { key: 'state', header: 'Trạng thái', render: (p) => <StatusBadge label={STATE_LABEL[p.state]} /> },
            { key: 'note', header: 'Ghi chú', render: (p) => p.note ?? '—' },
            {
              key: 'by',
              header: 'Người tạo',
              render: (p) => (
                <>
                  <div>{p.created_by_name ?? '—'}</div>
                  <div className="text-xs text-slate-500">{fmtDateTime(p.created_at)}</div>
                </>
              ),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (p) =>
                p.state === 'FUTURE' && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => remove(p.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-red-600" /> Xóa
                  </Button>
                ),
            },
          ]}
        />
      </AsyncBoundary>
    </Modal>
  );
}
