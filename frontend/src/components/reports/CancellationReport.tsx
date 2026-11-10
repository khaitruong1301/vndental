'use client';

import { useState } from 'react';
import { AsyncBoundary, Badge, Card, DataTable, StatCard } from '@/components/ui';
import { currentMonthStr } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import {
  ChartCard,
  CsvButton,
  downloadCsv,
  fmtMonth,
  fmtPct,
  HBarChart,
  KpiRow,
  MonthPicker,
  ReportToolbar,
  SERIES,
} from './common';

interface Data {
  totals: { bookings: number; cancelled: number; no_show: number };
  by_reason: { reason_code: string; reason_name: string; is_no_show: boolean; count: number }[];
  by_service: { service_id: number | null; service_name: string; count: number }[];
  rows: {
    service_id: number | null;
    service_name: string;
    reason_code: string;
    reason_name: string;
    is_no_show: boolean;
    cancelled_count: number;
  }[];
}

const COUNT_SERIES = [{ name: 'Số lịch hủy', color: SERIES[0] }];

// BC-04: thống kê hủy lịch (lịch nhiều khung tính là 1 lần)
export function CancellationReport() {
  const [month, setMonth] = useState(currentMonthStr());
  const { data, loading, error } = useApi<Data>('/reports/cancellations', { month });
  const t = data?.totals;
  const rate = (n: number) => (t && t.bookings ? (100 * n) / t.bookings : null);

  function exportCsv() {
    if (!data) return;
    downloadCsv(
      `BC-04_huy-lich_${month}.csv`,
      ['Dịch vụ dự kiến', 'Lý do hủy', 'Không đến', 'Số lịch hủy'],
      data.rows.map((r) => [r.service_name, r.reason_name, r.is_no_show ? 'Có' : '', r.cancelled_count]),
    );
  }

  return (
    <>
      <ReportToolbar code="BC-04" question="Việc gì hay bị hủy nhất, vì lý do gì?">
        <MonthPicker value={month} onChange={setMonth} />
        <CsvButton onClick={exportCsv} disabled={!data?.rows.length} />
      </ReportToolbar>
      <AsyncBoundary loading={loading && !data} error={error}>
        {data && t && (
          <>
            <KpiRow>
              <StatCard label={`Lịch hẹn ${fmtMonth(month)}`} value={t.bookings} />
              <StatCard label="Đã hủy" value={t.cancelled} tone="yellow" />
              <StatCard label="Tỷ lệ hủy" value={fmtPct(rate(t.cancelled))} tone="red" />
              <StatCard
                label="Không đến (no-show)"
                value={`${t.no_show} · ${t.cancelled ? fmtPct((100 * t.no_show) / t.cancelled) : '—'} số hủy`}
                tone="purple"
              />
            </KpiRow>
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Theo lý do hủy">
                <HBarChart
                  series={COUNT_SERIES}
                  format={(v) => `${v} lịch`}
                  rows={data.by_reason.map((r) => ({
                    key: r.reason_code,
                    label: r.is_no_show ? `${r.reason_name} ★` : r.reason_name,
                    values: [r.count],
                  }))}
                />
                {data.by_reason.some((r) => r.is_no_show) && (
                  <p className="mt-2 text-xs text-slate-500">★ Lý do «Không đến» — khách không báo trước</p>
                )}
              </ChartCard>
              <ChartCard title="Theo dịch vụ dự kiến">
                <HBarChart
                  series={COUNT_SERIES}
                  format={(v) => `${v} lịch`}
                  rows={data.by_service.map((r) => ({
                    key: String(r.service_id ?? 'none'),
                    label: r.service_name,
                    values: [r.count],
                  }))}
                />
              </ChartCard>
            </div>
            <Card title="Chi tiết dịch vụ × lý do" bodyClassName="p-0">
              <DataTable
                rows={data.rows}
                rowKey={(r, i) => `${r.service_id}-${r.reason_code}-${i}`}
                empty="Không có lịch hủy trong tháng"
                columns={[
                  { key: 'service', header: 'Dịch vụ dự kiến', render: (r) => r.service_name },
                  {
                    key: 'reason',
                    header: 'Lý do',
                    render: (r) => (
                      <>
                        {r.reason_name} {r.is_no_show && <Badge color="orange">Không đến</Badge>}
                      </>
                    ),
                  },
                  { key: 'count', header: 'Số lịch hủy', align: 'right', render: (r) => r.cancelled_count },
                ]}
              />
            </Card>
          </>
        )}
      </AsyncBoundary>
    </>
  );
}
