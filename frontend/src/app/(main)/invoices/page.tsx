'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import type { InvoiceList } from '@/components/billing/types';
import { Alert, Button, Card, DataTable, Field, Input, PageHeader, StatusBadge, Tabs } from '@/components/ui';
import { RequirePerm } from '@/lib/auth';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import { useApi, useDebounced } from '@/lib/hooks';
import { INVOICE_STATUS, INVOICE_TYPE, labelOf } from '@/lib/labels';

type TabKey = 'ALL' | 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'VOIDED';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'UNPAID', label: 'Chưa thu' },
  { key: 'PARTIALLY_PAID', label: 'Còn nợ' },
  { key: 'PAID', label: 'Đã đủ' },
  { key: 'VOIDED', label: 'Đã hủy' },
];

export default function InvoicesPage() {
  return (
    <RequirePerm perms={['TT-01', 'TT-04', 'TT-06']}>
      <Suspense>
        <InvoiceListView />
      </Suspense>
    </RequirePerm>
  );
}

function InvoiceListView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = searchParams.get('patient_id');
  const [tab, setTab] = useState<TabKey>((searchParams.get('status') as TabKey) || 'ALL');
  const [keyword, setKeyword] = useState('');
  const q = useDebounced(keyword.trim(), 350);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [tab, q, dateFrom, dateTo]);

  const { data, loading, error } = useApi<InvoiceList>('/billing/invoices', {
    status: tab === 'ALL' ? undefined : tab,
    q,
    date_from: dateFrom,
    date_to: dateTo,
    patient_id: patientId,
    page,
  });
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <>
      <PageHeader title="Hóa đơn & thu tiền" subtitle="Tra cứu hóa đơn, công nợ từng hóa đơn (TT-04, TT-06)" />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Field label="Tìm kiếm" className="md:col-span-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Mã hóa đơn, tên / mã bệnh nhân, SĐT..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
          </Field>
          <Field label="Từ ngày">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </Field>
          <Field label="Đến ngày">
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </Field>
        </div>
        {patientId && (
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            Đang lọc theo một bệnh nhân.
            <Button size="sm" variant="ghost" onClick={() => router.push('/invoices')}>
              Bỏ lọc
            </Button>
          </div>
        )}
      </Card>

      {error && <Alert kind="error">{error}</Alert>}
      <Card bodyClassName="p-0">
        {data && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-slate-100 px-4 py-2 text-sm text-slate-600">
            <span>
              <b className="text-slate-900">{data.total}</b> hóa đơn
            </span>
            <span>
              Tổng tiền (không tính đã hủy): <b className="text-slate-900">{fmtMoney(data.sum_total)}</b>
            </span>
            <span>
              Còn nợ: <b className="text-red-600">{fmtMoney(data.sum_balance)}</b>
            </span>
          </div>
        )}
        <DataTable
          rows={data?.rows}
          loading={loading}
          rowKey={(r) => r.id}
          empty="Không có hóa đơn phù hợp"
          onRowClick={(r) => router.push(`/invoices/${r.id}`)}
          columns={[
            {
              key: 'code',
              header: 'Hóa đơn',
              render: (r) => (
                <>
                  <div className="font-medium text-teal-700">{r.invoice_code}</div>
                  <div className="text-xs text-slate-500">{fmtDateTime(r.issued_at)}</div>
                </>
              ),
            },
            {
              key: 'patient',
              header: 'Bệnh nhân',
              render: (r) => (
                <>
                  <div className="font-medium">{r.patient_name}</div>
                  <div className="text-xs text-slate-500">
                    {r.patient_code} · {r.phone ?? '—'}
                  </div>
                </>
              ),
            },
            {
              key: 'type',
              header: 'Loại',
              render: (r) => (
                <>
                  <StatusBadge label={labelOf(INVOICE_TYPE, r.invoice_type)} />
                  <div className="mt-0.5 text-xs text-slate-500">{r.record_code ?? r.plan_code}</div>
                </>
              ),
            },
            { key: 'total', header: 'Tổng tiền', align: 'right', render: (r) => fmtMoney(r.total_amount) },
            { key: 'paid', header: 'Đã thu', align: 'right', render: (r) => fmtMoney(r.paid_amount) },
            {
              key: 'balance',
              header: 'Còn nợ',
              align: 'right',
              render: (r) =>
                r.status === 'VOIDED' ? (
                  '—'
                ) : (
                  <span className={r.balance_due > 0 ? 'font-medium text-red-600' : ''}>{fmtMoney(r.balance_due)}</span>
                ),
            },
            { key: 'status', header: 'Trạng thái', render: (r) => <StatusBadge label={labelOf(INVOICE_STATUS, r.status)} /> },
            { key: 'by', header: 'Người lập', render: (r) => r.issued_by_name },
          ]}
        />
        {data && pageCount > 1 && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-2 text-sm">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Trước
            </Button>
            <span>
              Trang {page}/{pageCount}
            </span>
            <Button size="sm" variant="secondary" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
              Sau
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
