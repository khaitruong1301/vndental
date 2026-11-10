'use client';

import Link from 'next/link';
import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import type { DebtInvoice, DebtRow } from '@/components/billing/types';
import { AsyncBoundary, Button, Card, EmptyState, Input, Loading, PageHeader, StatusBadge } from '@/components/ui';
import { RequirePerm, useAuth } from '@/lib/auth';
import { fmtDate, fmtMoney } from '@/lib/format';
import { useApi, useDebounced } from '@/lib/hooks';
import { INVOICE_STATUS, INVOICE_TYPE, labelOf } from '@/lib/labels';

export default function DebtsPage() {
  return (
    <RequirePerm perms={['TT-06']}>
      <DebtsView />
    </RequirePerm>
  );
}

function DebtsView() {
  const [keyword, setKeyword] = useState('');
  const q = useDebounced(keyword.trim(), 350);
  const { data, loading, error } = useApi<DebtRow[]>('/billing/debts', { q });
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <>
      <PageHeader title="Công nợ" subtitle="Tổng tiền khách còn nợ, chia theo từng bệnh nhân (TT-06)" />
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Tên, mã bệnh nhân hoặc SĐT..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          {data && data.length > 0 && (
            <div className="text-sm text-slate-600">
              Tổng công nợ toàn phòng khám: <b className="text-lg text-red-600">{fmtMoney(data[0].grand_total)}</b>
            </div>
          )}
        </div>
      </Card>

      <AsyncBoundary loading={loading && !data} error={error}>
        {!data?.length ? (
          <EmptyState title={q ? 'Không có bệnh nhân nợ phù hợp' : 'Không có công nợ'} />
        ) : (
          <Card bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-8 px-3 py-2" />
                    <th className="px-3 py-2 text-left">Bệnh nhân</th>
                    <th className="px-3 py-2 text-left">SĐT</th>
                    <th className="px-3 py-2 text-right">Số hóa đơn nợ</th>
                    <th className="px-3 py-2 text-left">Nợ từ ngày</th>
                    <th className="px-3 py-2 text-right">Tổng nợ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {data.map((d) => {
                    const open = expanded === d.patient_id;
                    return (
                      <Fragment key={d.patient_id}>
                        <tr
                          className="cursor-pointer hover:bg-teal-50/50"
                          onClick={() => setExpanded(open ? null : d.patient_id)}
                        >
                          <td className="px-3 py-2 text-slate-400">
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{d.full_name}</div>
                            <div className="text-xs text-slate-500">{d.patient_code}</div>
                          </td>
                          <td className="px-3 py-2">{d.phone ?? '—'}</td>
                          <td className="px-3 py-2 text-right">{d.open_invoices}</td>
                          <td className="px-3 py-2">{fmtDate(d.oldest_invoice_at)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-red-600">{fmtMoney(d.total_debt)}</td>
                        </tr>
                        {open && (
                          <tr>
                            <td colSpan={6} className="bg-slate-50 px-6 py-3">
                              <PatientDebts patientId={d.patient_id} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </AsyncBoundary>
    </>
  );
}

function PatientDebts({ patientId }: { patientId: number }) {
  const { can } = useAuth();
  const { data, loading, error } = useApi<DebtInvoice[]>(`/billing/debts/${patientId}`);
  if (loading && !data) return <Loading />;
  if (error) return <div className="text-sm text-red-600">{error}</div>;

  return (
    <div className="space-y-2">
      {data?.map((i) => (
        <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
          <div className="text-sm">
            <Link href={`/invoices/${i.id}`} className="font-medium text-teal-700 hover:underline">
              {i.invoice_code}
            </Link>{' '}
            <StatusBadge label={labelOf(INVOICE_TYPE, i.invoice_type)} />{' '}
            <StatusBadge label={labelOf(INVOICE_STATUS, i.status)} />
            <div className="text-xs text-slate-500">
              {fmtDate(i.issued_at)} · {i.record_code ?? `${i.plan_code} — ${i.plan_name}`} · Tổng {fmtMoney(i.total_amount)} · Đã thu{' '}
              {fmtMoney(i.paid_amount)}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-semibold text-red-600">{fmtMoney(i.balance_due)}</span>
            {can('TT-04') && (
              <Link href={`/invoices/${i.id}`}>
                <Button size="sm">Thu tiền</Button>
              </Link>
            )}
          </div>
        </div>
      ))}
      <div className="text-xs text-slate-500">
        <Link href={`/invoices?patient_id=${patientId}`} className="hover:underline">
          Xem tất cả hóa đơn của bệnh nhân →
        </Link>
      </div>
    </div>
  );
}
