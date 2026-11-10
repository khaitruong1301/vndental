'use client';

import { useState } from 'react';
import { AsyncBoundary, Card, DataTable, StatCard } from '@/components/ui';
import { currentMonthStr } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import {
  CsvButton,
  downloadCsv,
  fmtMonth,
  fmtPct,
  KpiRow,
  MonthPicker,
  ReportToolbar,
  SEQ_BLUE,
  TipRow,
  useChartTooltip,
} from './common';

interface Cell {
  chair_id: number;
  chair_name: string;
  iso_weekday: number;
  slot_time: string;
  available_slots: number;
  booked_slots: number;
  utilization_pct: number;
}

interface Data {
  month: string;
  totals: { booked: number; available: number; utilization_pct: number };
  chairs: { chair_id: number; chair_name: string; booked: number; available: number; utilization_pct: number }[];
  emptiest_slots: { slot_time: string; booked: number; available: number; utilization_pct: number }[];
  cells: Cell[];
}

const WEEKDAYS = [
  { dow: 1, label: 'T2', name: 'Thứ 2' },
  { dow: 2, label: 'T3', name: 'Thứ 3' },
  { dow: 3, label: 'T4', name: 'Thứ 4' },
  { dow: 4, label: 'T5', name: 'Thứ 5' },
  { dow: 5, label: 'T6', name: 'Thứ 6' },
  { dow: 6, label: 'T7', name: 'Thứ 7' },
  { dow: 7, label: 'CN', name: 'Chủ nhật' },
];

const TIMES = Array.from({ length: 24 }, (_, i) => {
  const minutes = 8 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

// Ngưỡng tô màu: 0% = xám nhạt (trống hoàn toàn), sau đó 7 bậc xanh tuần tự
const BINS = [15, 30, 45, 60, 75, 90, 100];
const ZERO_COLOR = '#eef2f6';

function cellColor(pct: number): string {
  if (pct <= 0) return ZERO_COLOR;
  const i = BINS.findIndex((b) => pct <= b);
  return SEQ_BLUE[i === -1 ? SEQ_BLUE.length - 1 : i];
}

function Heatmap({ chair, cells }: { chair: Data['chairs'][number]; cells: Map<string, Cell> }) {
  const { ref, bind, node } = useChartTooltip();
  return (
    <div ref={ref} className="relative">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-slate-800">{chair.chair_name}</span>
        <span className="text-xs text-slate-500">
          {chair.booked}/{chair.available} khung · {fmtPct(chair.utilization_pct)}
        </span>
      </div>
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: '2.75rem repeat(7, minmax(0, 1fr))' }}>
        <div />
        {WEEKDAYS.map((w) => (
          <div key={w.dow} className="text-center text-[11px] text-slate-500">
            {w.label}
          </div>
        ))}
        {TIMES.map((time) => (
          <div key={time} className="contents">
            <div className="pr-1 text-right text-[10px] leading-3 text-slate-400">{time.endsWith(':00') ? time : ''}</div>
            {WEEKDAYS.map((w) => {
              const c = cells.get(`${chair.chair_id}|${w.dow}|${time}`);
              if (!c) {
                return <div key={w.dow} className="h-3 rounded-[2px] border border-dashed border-slate-200" title="Ngoài giờ mở cửa" />;
              }
              const label = `${chair.chair_name}, ${w.name} ${time}: ${c.booked_slots}/${c.available_slots} khung (${fmtPct(c.utilization_pct)})`;
              return (
                <div
                  key={w.dow}
                  className="h-3 rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                  style={{ background: cellColor(c.utilization_pct) }}
                  {...bind(
                    <>
                      <div className="mb-1 font-medium text-slate-900">
                        {chair.chair_name} · {w.name} {time}
                      </div>
                      <TipRow label="Đã đặt" value={`${c.booked_slots}/${c.available_slots} khung`} />
                      <TipRow label="Công suất" value={fmtPct(c.utilization_pct)} />
                    </>,
                    label,
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
      {node}
    </div>
  );
}

// BC-02: công suất ghế theo thứ × khung 30 phút
export function ChairUtilizationReport() {
  const [month, setMonth] = useState(currentMonthStr());
  const { data, loading, error } = useApi<Data>('/reports/chair-utilization', { month });

  const cellMap = new Map((data?.cells ?? []).map((c) => [`${c.chair_id}|${c.iso_weekday}|${c.slot_time}`, c]));
  const emptiestChair = data?.chairs.length
    ? [...data.chairs].sort((a, b) => a.utilization_pct - b.utilization_pct)[0]
    : null;

  function exportCsv() {
    if (!data) return;
    downloadCsv(
      `BC-02_cong-suat-ghe_${data.month}.csv`,
      ['Ghế', 'Thứ', 'Khung giờ', 'Khung đã đặt', 'Khung khả dụng', '% công suất'],
      data.cells.map((c) => [
        c.chair_name,
        WEEKDAYS.find((w) => w.dow === c.iso_weekday)?.name,
        c.slot_time,
        c.booked_slots,
        c.available_slots,
        c.utilization_pct,
      ]),
    );
  }

  return (
    <>
      <ReportToolbar code="BC-02" question="Ghế nào trống nhiều nhất, vào khung giờ nào?">
        <MonthPicker value={month} onChange={setMonth} />
        <CsvButton onClick={exportCsv} disabled={!data?.cells.length} />
      </ReportToolbar>
      <AsyncBoundary loading={loading && !data} error={error}>
        {data && (
          <>
            <KpiRow>
              <StatCard label={`Công suất chung ${fmtMonth(data.month)}`} value={fmtPct(data.totals.utilization_pct)} />
              <StatCard label="Khung đã đặt" value={`${data.totals.booked}/${data.totals.available}`} tone="blue" />
              <StatCard
                label="Ghế trống nhiều nhất"
                value={emptiestChair ? `${emptiestChair.chair_name} (${fmtPct(emptiestChair.utilization_pct)})` : '—'}
                tone="yellow"
              />
              <StatCard
                label="Khung giờ trống nhất"
                value={data.emptiest_slots[0] ? `${data.emptiest_slots[0].slot_time} (${fmtPct(data.emptiest_slots[0].utilization_pct)})` : '—'}
                tone="purple"
              />
            </KpiRow>
            <Card
              title="Bản đồ nhiệt công suất theo thứ × khung 30 phút"
              className="mb-4"
              actions={
                <div className="flex items-center gap-1 text-[11px] text-slate-500">
                  <span className="inline-block h-3 w-4 rounded-[2px]" style={{ background: ZERO_COLOR }} /> 0%
                  {SEQ_BLUE.map((c, i) => (
                    <span key={c} className="inline-block h-3 w-4 rounded-[2px]" style={{ background: c }} title={`≤ ${BINS[i]}%`} />
                  ))}
                  <span className="ml-1">100%</span>
                  <span className="ml-3 inline-block h-3 w-4 rounded-[2px] border border-dashed border-slate-300" /> Ngoài giờ
                </div>
              }
            >
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {data.chairs.map((chair) => (
                  <Heatmap key={chair.chair_id} chair={chair} cells={cellMap} />
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Khung khả dụng = số ngày cùng thứ trong tháng có mở cửa (8h–20h; Chủ nhật 14h–17h). Lịch đã hủy không tính.
              </p>
            </Card>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Công suất từng ghế" bodyClassName="p-0">
                <DataTable
                  rows={data.chairs}
                  rowKey={(r) => r.chair_id}
                  columns={[
                    { key: 'chair', header: 'Ghế', render: (r) => r.chair_name },
                    { key: 'booked', header: 'Đã đặt', align: 'right', render: (r) => r.booked },
                    { key: 'available', header: 'Khả dụng', align: 'right', render: (r) => r.available },
                    { key: 'pct', header: 'Công suất', align: 'right', render: (r) => fmtPct(r.utilization_pct) },
                  ]}
                />
              </Card>
              <Card title={`5 khung giờ trống nhất (cả ${data.chairs.length} ghế, mọi ngày)`} bodyClassName="p-0">
                <DataTable
                  rows={data.emptiest_slots}
                  rowKey={(r) => r.slot_time}
                  columns={[
                    { key: 'time', header: 'Khung giờ', render: (r) => r.slot_time },
                    { key: 'booked', header: 'Đã đặt', align: 'right', render: (r) => `${r.booked}/${r.available}` },
                    { key: 'pct', header: 'Công suất', align: 'right', render: (r) => fmtPct(r.utilization_pct) },
                  ]}
                />
              </Card>
            </div>
          </>
        )}
      </AsyncBoundary>
    </>
  );
}
