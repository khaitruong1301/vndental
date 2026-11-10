'use client';

import { useState } from 'react';
import { AsyncBoundary, Card, DataTable, StatCard } from '@/components/ui';
import { currentMonthStr, fmtMoney } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import {
  ChangeText,
  ChartCard,
  CsvButton,
  downloadCsv,
  fmtMonth,
  HBarChart,
  KpiRow,
  Legend,
  MonthPicker,
  pctChange,
  ReportToolbar,
  SERIES,
} from './common';

interface Row {
  doctor_id: number;
  staff_code: string;
  doctor_name: string;
  line_count: number;
  revenue: number;
  collected: number;
  previous_revenue: number;
}

interface Data {
  month: string;
  previous_month: string;
  totals: { revenue: number; collected: number; previous_revenue: number };
  rows: Row[];
}

const CHART_SERIES = [
  { name: 'Doanh thu', color: SERIES[0] },
  { name: 'Đã thu thực tế', color: SERIES[1] },
];

// BC-01: doanh thu theo bác sĩ thực hiện (giá trị dòng sau giảm giá)
export function DoctorRevenueReport() {
  const [month, setMonth] = useState(currentMonthStr());
  const { data, loading, error } = useApi<Data>('/reports/doctor-revenue', { month });
  const t = data?.totals;

  function exportCsv() {
    if (!data) return;
    downloadCsv(
      `BC-01_doanh-thu-bac-si_${data.month}.csv`,
      ['Mã BS', 'Bác sĩ', 'Số dòng dịch vụ', 'Doanh thu', 'Đã thu thực tế', `Doanh thu ${fmtMonth(data.previous_month)}`, '% thay đổi'],
      data.rows.map((r) => [
        r.staff_code,
        r.doctor_name,
        r.line_count,
        r.revenue,
        r.collected,
        r.previous_revenue,
        pctChange(r.revenue, r.previous_revenue),
      ]),
    );
  }

  return (
    <>
      <ReportToolbar code="BC-01" question="Tháng này mỗi bác sĩ làm ra bao nhiêu tiền?">
        <MonthPicker value={month} onChange={setMonth} />
        <CsvButton onClick={exportCsv} disabled={!data?.rows.length} />
      </ReportToolbar>
      <AsyncBoundary loading={loading && !data} error={error}>
        {data && t && (
          <>
            <KpiRow>
              <StatCard label={`Doanh thu ${fmtMonth(data.month)}`} value={fmtMoney(t.revenue)} />
              <StatCard label="Đã thu thực tế" value={fmtMoney(t.collected)} tone="green" />
              <StatCard label={`Doanh thu ${fmtMonth(data.previous_month)}`} value={fmtMoney(t.previous_revenue)} tone="blue" />
              <StatCard label="So với tháng trước" value={<ChangeText pct={pctChange(t.revenue, t.previous_revenue)} />} tone="purple" />
            </KpiRow>
            <ChartCard title="Doanh thu và đã thu theo bác sĩ" legend={<Legend items={CHART_SERIES} />}>
              <HBarChart
                series={CHART_SERIES}
                format={fmtMoney}
                rows={data.rows.map((r) => ({
                  key: r.doctor_id,
                  label: r.doctor_name,
                  values: [r.revenue, r.collected],
                }))}
              />
            </ChartCard>
            <Card title="Chi tiết theo bác sĩ" bodyClassName="p-0">
              <DataTable
                rows={data.rows}
                rowKey={(r) => r.doctor_id}
                columns={[
                  {
                    key: 'doctor',
                    header: 'Bác sĩ',
                    render: (r) => (
                      <>
                        <div className="font-medium">{r.doctor_name}</div>
                        <div className="text-xs text-slate-500">{r.staff_code}</div>
                      </>
                    ),
                  },
                  { key: 'lines', header: 'Số dòng DV', align: 'right', render: (r) => r.line_count },
                  { key: 'revenue', header: 'Doanh thu', align: 'right', render: (r) => fmtMoney(r.revenue) },
                  { key: 'collected', header: 'Đã thu', align: 'right', render: (r) => fmtMoney(r.collected) },
                  {
                    key: 'prev',
                    header: `Tháng trước (${fmtMonth(data.previous_month)})`,
                    align: 'right',
                    render: (r) => fmtMoney(r.previous_revenue),
                  },
                  {
                    key: 'change',
                    header: '% thay đổi',
                    align: 'right',
                    render: (r) => <ChangeText pct={pctChange(r.revenue, r.previous_revenue)} />,
                  },
                ]}
              />
              <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
                Doanh thu tính theo giá trị dòng dịch vụ sau giảm giá trên hóa đơn lập trong tháng, ghi cho bác sĩ thực hiện
                từng dòng. «Đã thu» phân bổ số tiền khách đã trả theo tỷ lệ giá trị dòng.
              </p>
            </Card>
          </>
        )}
      </AsyncBoundary>
    </>
  );
}
