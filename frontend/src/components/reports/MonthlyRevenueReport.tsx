'use client';

import { useState } from 'react';
import { AsyncBoundary, Card, DataTable, Select, StatCard } from '@/components/ui';
import { fmtMoney } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import {
  ChangeText,
  ChartCard,
  ColumnChart,
  CsvButton,
  downloadCsv,
  fmtCompactMoney,
  fmtMonth,
  KpiRow,
  Legend,
  ReportToolbar,
  SERIES,
  TipRow,
} from './common';

interface Row {
  month: string;
  revenue: number;
  invoice_count: number;
  collected: number;
  previous_revenue: number | null;
  revenue_change_pct: number | null;
}

const CHART_SERIES = [
  { name: 'Doanh thu', color: SERIES[0] },
  { name: 'Đã thu', color: SERIES[1] },
];

// BC-08: doanh thu theo tháng, % so với tháng trước
export function MonthlyRevenueReport() {
  const [months, setMonths] = useState(12);
  const { data, loading, error } = useApi<{ months: number; rows: Row[] }>('/reports/monthly-revenue', { months });
  const rows = data?.rows ?? [];
  const last = rows[rows.length - 1];
  const total = rows.reduce((s, r) => s + r.revenue, 0);

  function exportCsv() {
    downloadCsv(
      `BC-08_doanh-thu-${months}-thang.csv`,
      ['Tháng', 'Số hóa đơn', 'Doanh thu', 'Đã thu', 'Doanh thu tháng trước', '% thay đổi'],
      rows.map((r) => [r.month, r.invoice_count, r.revenue, r.collected, r.previous_revenue, r.revenue_change_pct]),
    );
  }

  return (
    <>
      <ReportToolbar code="BC-08" question="Doanh thu tăng/giảm bao nhiêu % so với tháng trước?">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Khoảng
          <Select className="w-32" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {[6, 12, 24].map((m) => (
              <option key={m} value={m}>
                {m} tháng
              </option>
            ))}
          </Select>
        </label>
        <CsvButton onClick={exportCsv} disabled={!rows.length} />
      </ReportToolbar>
      <AsyncBoundary loading={loading && !data} error={error}>
        {last && (
          <>
            <KpiRow>
              <StatCard label={`Doanh thu ${fmtMonth(last.month)}`} value={fmtMoney(last.revenue)} />
              <StatCard label="So với tháng trước" value={<ChangeText pct={last.revenue_change_pct} />} tone="purple" />
              <StatCard label={`Đã thu ${fmtMonth(last.month)}`} value={fmtMoney(last.collected)} tone="green" />
              <StatCard label={`Tổng ${months} tháng`} value={fmtMoney(total)} tone="blue" />
            </KpiRow>
            <ChartCard title="Doanh thu và đã thu theo tháng" legend={<Legend items={CHART_SERIES} />}>
              <ColumnChart
                series={CHART_SERIES}
                format={fmtMoney}
                axisFormat={fmtCompactMoney}
                groups={rows.map((r) => ({ key: r.month, label: fmtMonth(r.month), values: [r.revenue, r.collected] }))}
                tipExtra={(i) => (
                  <div className="mt-1 border-t border-slate-100 pt-1">
                    <TipRow label="So với tháng trước" value={<ChangeText pct={rows[i].revenue_change_pct} />} />
                  </div>
                )}
              />
            </ChartCard>
          </>
        )}
        <Card title="Chi tiết theo tháng" bodyClassName="p-0">
          <DataTable
            rows={[...rows].reverse()}
            rowKey={(r) => r.month}
            columns={[
              { key: 'month', header: 'Tháng', render: (r) => fmtMonth(r.month) },
              { key: 'count', header: 'Số hóa đơn', align: 'right', render: (r) => r.invoice_count },
              { key: 'revenue', header: 'Doanh thu', align: 'right', render: (r) => fmtMoney(r.revenue) },
              { key: 'collected', header: 'Đã thu', align: 'right', render: (r) => fmtMoney(r.collected) },
              { key: 'prev', header: 'Tháng trước', align: 'right', render: (r) => fmtMoney(r.previous_revenue) },
              { key: 'change', header: '% thay đổi', align: 'right', render: (r) => <ChangeText pct={r.revenue_change_pct} /> },
            ]}
          />
          <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
            Doanh thu = tổng hóa đơn (không tính hóa đơn đã hủy) lập trong tháng; «Đã thu» = tiền thu thực tế trong tháng.
            Tháng trước bằng 0 thì không tính được % thay đổi.
          </p>
        </Card>
      </AsyncBoundary>
    </>
  );
}
