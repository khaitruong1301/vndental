'use client';

import Link from 'next/link';
import { AsyncBoundary, Button, Card, DataTable, StatCard } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtMoney } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { ChartCard, CsvButton, downloadCsv, HBarChart, KpiRow, ReportToolbar, SERIES, TextLink } from './common';

interface Row {
  patient_id: number;
  patient_code: string;
  full_name: string;
  phone: string | null;
  open_invoices: number;
  total_debt: number;
  oldest_invoice_at: string;
}

interface Data {
  totals: { total_debt: number; patients: number; open_invoices: number };
  rows: Row[];
}

const DEBT_SERIES = [{ name: 'Còn nợ', color: SERIES[0] }];
const TOP = 10;

// BC-05: công nợ theo bệnh nhân
export function DebtReport() {
  const { can } = useAuth();
  const { data, loading, error } = useApi<Data>('/reports/debts');

  function exportCsv() {
    if (!data) return;
    downloadCsv(
      'BC-05_cong-no-benh-nhan.csv',
      ['Mã BN', 'Họ tên', 'SĐT', 'Số hóa đơn còn nợ', 'Tổng còn nợ', 'Hóa đơn nợ lâu nhất'],
      data.rows.map((r) => [r.patient_code, r.full_name, r.phone, r.open_invoices, r.total_debt, fmtDate(r.oldest_invoice_at)]),
    );
  }

  return (
    <>
      <ReportToolbar code="BC-05" question="Tổng tiền khách còn nợ, chia theo từng người?">
        {can('TT-06') && (
          <Link href="/debts">
            <Button variant="secondary">Tra cứu công nợ</Button>
          </Link>
        )}
        <CsvButton onClick={exportCsv} disabled={!data?.rows.length} />
      </ReportToolbar>
      <AsyncBoundary loading={loading && !data} error={error}>
        {data && (
          <>
            <KpiRow>
              <StatCard label="Tổng còn nợ" value={fmtMoney(data.totals.total_debt)} tone="red" />
              <StatCard label="Số bệnh nhân còn nợ" value={data.totals.patients} tone="yellow" />
              <StatCard label="Hóa đơn chưa thu đủ" value={data.totals.open_invoices} tone="blue" />
            </KpiRow>
            <ChartCard title={data.rows.length > TOP ? `${TOP} bệnh nhân nợ nhiều nhất` : 'Còn nợ theo bệnh nhân'}>
              <HBarChart
                series={DEBT_SERIES}
                format={fmtMoney}
                rows={data.rows.slice(0, TOP).map((r) => ({ key: r.patient_id, label: r.full_name, values: [r.total_debt] }))}
              />
            </ChartCard>
            <Card title="Chi tiết công nợ" bodyClassName="p-0">
              <DataTable
                rows={data.rows}
                rowKey={(r) => r.patient_id}
                empty="Không có công nợ"
                columns={[
                  {
                    key: 'patient',
                    header: 'Bệnh nhân',
                    render: (r) => (
                      <>
                        <TextLink href={`/patients/${r.patient_id}`}>{r.full_name}</TextLink>
                        <div className="text-xs text-slate-500">{r.patient_code}</div>
                      </>
                    ),
                  },
                  { key: 'phone', header: 'SĐT', render: (r) => r.phone ?? '—' },
                  { key: 'count', header: 'Số HĐ còn nợ', align: 'right', render: (r) => r.open_invoices },
                  { key: 'oldest', header: 'Nợ từ ngày', render: (r) => fmtDate(r.oldest_invoice_at) },
                  { key: 'debt', header: 'Còn nợ', align: 'right', render: (r) => <span className="font-medium">{fmtMoney(r.total_debt)}</span> },
                ]}
              />
            </Card>
          </>
        )}
      </AsyncBoundary>
    </>
  );
}
