'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { History, SlidersHorizontal } from 'lucide-react';
import { ImportForm, type InventoryRow, StockTakeForm } from '@/components/admin/InventoryForms';
import {
  Alert,
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
  Textarea,
  cn,
} from '@/components/ui';
import { api } from '@/lib/api';
import { RequirePerm, useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';
import { ITEM_TYPE, labelOf, MOVEMENT_TYPE } from '@/lib/labels';

type TabKey = 'stock' | 'import' | 'stock-take' | 'movements';

interface MovementRow {
  id: number;
  item_id: number;
  item_code: string;
  item_name: string;
  unit: string;
  movement_type: string;
  quantity: number;
  unit_cost: number | null;
  supplier: string | null;
  batch_no: string | null;
  expiry_date: string | null;
  note: string | null;
  record_code: string | null;
  created_by_name: string | null;
  created_at: string;
}

interface MovementPage {
  rows: MovementRow[];
  total: number;
  page: number;
  page_size: number;
}

export default function InventoryPage() {
  return (
    <RequirePerm perms={['QT-04']}>
      <InventoryBoard />
    </RequirePerm>
  );
}

function InventoryBoard() {
  const [tab, setTab] = useState<TabKey>('stock');
  const [historyItem, setHistoryItem] = useState('');
  const { data, loading, error, reload } = useApi<InventoryRow[]>('/admin/inventory');
  const { reloadLookups } = useAuth();
  const lowCount = data?.filter((i) => i.is_active && i.low_stock).length ?? 0;

  function afterStockChange() {
    reload();
    reloadLookups().catch(() => undefined);
  }

  return (
    <>
      <PageHeader title="Kho vật tư & thuốc" subtitle="QT-04 · Tồn kho, nhập kho, kiểm kê, lịch sử phát sinh" />
      <Tabs
        tabs={[
          { key: 'stock', label: 'Tồn kho', count: lowCount || undefined },
          { key: 'import', label: 'Nhập kho' },
          { key: 'stock-take', label: 'Kiểm kê' },
          { key: 'movements', label: 'Lịch sử phát sinh' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <AsyncBoundary loading={loading && !data} error={error}>
        {data && tab === 'stock' && (
          <StockTab
            items={data}
            lowCount={lowCount}
            onChanged={afterStockChange}
            onHistory={(id) => {
              setHistoryItem(String(id));
              setTab('movements');
            }}
          />
        )}
        {data && tab === 'import' && <ImportForm items={data} onDone={afterStockChange} />}
        {data && tab === 'stock-take' && <StockTakeForm items={data} onDone={afterStockChange} />}
        {data && tab === 'movements' && <MovementsTab items={data} itemId={historyItem} onItemChange={setHistoryItem} />}
      </AsyncBoundary>
    </>
  );
}

function StockTab({
  items,
  lowCount,
  onChanged,
  onHistory,
}: {
  items: InventoryRow[];
  lowCount: number;
  onChanged: () => void;
  onHistory: (itemId: number) => void;
}) {
  const [type, setType] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [adjusting, setAdjusting] = useState<InventoryRow | null>(null);
  const rows = items.filter((i) => (!type || i.item_type === type) && (!onlyLow || i.low_stock));

  return (
    <>
      {lowCount > 0 && (
        <div className="mb-4">
          <Alert kind="warning" title={`${lowCount} mặt hàng đang ở mức hoặc dưới ngưỡng tồn tối thiểu`}>
            Cảnh báo dưới ngưỡng được gửi tới Quản lý (DT-07) — xem tại{' '}
            <Link href="/notifications" className="font-medium underline">
              Thông báo
            </Link>
            .
          </Alert>
        </div>
      )}
      <Card
        bodyClassName="p-0"
        title={
          <div className="flex flex-wrap items-center gap-3">
            <Select className="w-40" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Tất cả loại</option>
              <option value="SUPPLY">Vật tư</option>
              <option value="MEDICINE">Thuốc</option>
            </Select>
            <Checkbox label="Chỉ hiện sắp hết" checked={onlyLow} onChange={setOnlyLow} />
          </div>
        }
      >
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            {
              key: 'name',
              header: 'Mặt hàng',
              render: (r) => (
                <div className={cn(!r.is_active && 'opacity-60')}>
                  <div className="font-medium text-slate-900">{r.name}</div>
                  <div className="text-xs text-slate-500">
                    {r.code}
                    {!r.is_active && ' · ngừng dùng'}
                  </div>
                </div>
              ),
            },
            { key: 'type', header: 'Loại', render: (r) => <StatusBadge label={labelOf(ITEM_TYPE, r.item_type)} /> },
            {
              key: 'stock',
              header: 'Tồn kho',
              align: 'right',
              render: (r) => (
                <span className={cn('font-semibold', r.low_stock && 'text-red-600')}>
                  {fmtNumber(r.current_stock)} {r.unit}
                </span>
              ),
            },
            { key: 'min', header: 'Ngưỡng', align: 'right', render: (r) => `${fmtNumber(r.min_stock)} ${r.unit}` },
            {
              key: 'status',
              header: 'Tình trạng',
              render: (r) =>
                r.below_threshold ? (
                  <Badge color="red">Dưới ngưỡng</Badge>
                ) : r.low_stock ? (
                  <Badge color="yellow">Chạm ngưỡng</Badge>
                ) : (
                  <Badge color="green">Đủ dùng</Badge>
                ),
            },
            {
              key: 'price',
              header: 'Giá bán',
              align: 'right',
              render: (r) => (r.item_type === 'MEDICINE' ? fmtMoney(r.current_price) : '—'),
            },
            { key: 'import', header: 'Nhập gần nhất', render: (r) => fmtDate(r.last_import_at) },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (r) => (
                <div className="flex justify-end gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => onHistory(r.id)}>
                    <History className="h-3.5 w-3.5" /> Lịch sử
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setAdjusting(r)}>
                    <SlidersHorizontal className="h-3.5 w-3.5" /> Điều chỉnh
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Card>
      {adjusting && (
        <AdjustModal
          item={adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={() => {
            setAdjusting(null);
            onChanged();
          }}
        />
      )}
    </>
  );
}

function AdjustModal({ item, onClose, onSaved }: { item: InventoryRow; onClose: () => void; onSaved: () => void }) {
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const { run, busy } = useAction();
  const q = Number(quantity);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await run(() => api.post('/admin/inventory/adjust', { item_id: item.id, quantity: q, note }), 'Đã điều chỉnh tồn kho'))
      onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Điều chỉnh tồn kho — ${item.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" form="adjust-form" loading={busy} disabled={!q || !note.trim()}>
            Lưu điều chỉnh
          </Button>
        </>
      }
    >
      <form id="adjust-form" onSubmit={submit} className="space-y-4">
        <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Tồn hiện tại: <b>{fmtNumber(item.current_stock)} {item.unit}</b>
          {q !== 0 && !Number.isNaN(q) && (
            <>
              {' '}→ sau điều chỉnh: <b>{fmtNumber(item.current_stock + q)} {item.unit}</b>
            </>
          )}
        </div>
        <Field label="Số lượng điều chỉnh" required hint="Số dương để cộng thêm, số âm để trừ (vd. -2 khi hỏng/hết hạn)">
          <Input type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus />
        </Field>
        <Field label="Lý do" required>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="vd. Hủy do hết hạn sử dụng" />
        </Field>
      </form>
    </Modal>
  );
}

function MovementsTab({
  items,
  itemId,
  onItemChange,
}: {
  items: InventoryRow[];
  itemId: string;
  onItemChange: (id: string) => void;
}) {
  const [type, setType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error } = useApi<MovementPage>('/admin/inventory/movements', {
    item_id: itemId,
    movement_type: type,
    date_from: dateFrom,
    date_to: dateTo,
    page,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <Card
      bodyClassName="p-0"
      title={
        <div className="flex flex-wrap items-end gap-2">
          <Select className="w-64" value={itemId} onChange={(e) => resetPage(onItemChange)(e.target.value)}>
            <option value="">Tất cả mặt hàng</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.code})
              </option>
            ))}
          </Select>
          <Select className="w-48" value={type} onChange={(e) => resetPage(setType)(e.target.value)}>
            <option value="">Tất cả loại phát sinh</option>
            {Object.entries(MOVEMENT_TYPE).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
          <Input type="date" className="w-40" value={dateFrom} onChange={(e) => resetPage(setDateFrom)(e.target.value)} title="Từ ngày" />
          <Input type="date" className="w-40" value={dateTo} onChange={(e) => resetPage(setDateTo)(e.target.value)} title="Đến ngày" />
        </div>
      }
    >
      <AsyncBoundary loading={loading && !data} error={error}>
        <DataTable
          rows={data?.rows}
          rowKey={(r) => r.id}
          empty="Không có phát sinh kho"
          columns={[
            { key: 'time', header: 'Thời gian', render: (r) => fmtDateTime(r.created_at) },
            {
              key: 'item',
              header: 'Mặt hàng',
              render: (r) => (
                <>
                  <div className="font-medium">{r.item_name}</div>
                  <div className="text-xs text-slate-500">{r.item_code}</div>
                </>
              ),
            },
            { key: 'type', header: 'Loại', render: (r) => <StatusBadge label={labelOf(MOVEMENT_TYPE, r.movement_type)} /> },
            {
              key: 'qty',
              header: 'Số lượng',
              align: 'right',
              render: (r) => (
                <span className={cn('font-semibold', r.quantity > 0 ? 'text-emerald-600' : 'text-red-600')}>
                  {r.quantity > 0 ? '+' : ''}
                  {fmtNumber(r.quantity)} {r.unit}
                </span>
              ),
            },
            { key: 'cost', header: 'Đơn giá nhập', align: 'right', render: (r) => (r.unit_cost === null ? '—' : fmtMoney(r.unit_cost)) },
            {
              key: 'batch',
              header: 'NCC / lô / hạn dùng',
              render: (r) =>
                r.supplier || r.batch_no || r.expiry_date ? (
                  <div className="text-xs">
                    {r.supplier && <div>{r.supplier}</div>}
                    {(r.batch_no || r.expiry_date) && (
                      <div className="text-slate-500">
                        {r.batch_no && `Lô ${r.batch_no}`} {r.expiry_date && `· HSD ${fmtDate(r.expiry_date)}`}
                      </div>
                    )}
                  </div>
                ) : (
                  '—'
                ),
            },
            { key: 'record', header: 'Phiếu điều trị', render: (r) => r.record_code ?? '—' },
            { key: 'by', header: 'Người tạo', render: (r) => r.created_by_name ?? '—' },
            { key: 'note', header: 'Ghi chú', render: (r) => <span className="text-xs text-slate-600">{r.note ?? '—'}</span> },
          ]}
        />
        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-sm text-slate-600">
            <span>
              {data.total} phát sinh · trang {data.page}/{pages}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Trước
              </Button>
              <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Sau
              </Button>
            </div>
          </div>
        )}
      </AsyncBoundary>
    </Card>
  );
}
