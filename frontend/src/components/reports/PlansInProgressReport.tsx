'use client';

import { AsyncBoundary, Card, DataTable, StatCard, StatusBadge } from '@/components/ui';
import { fmtDate, fmtMoney } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { labelOf, PLAN_TYPE } from '@/lib/labels';
import { CsvButton, downloadCsv, KpiRow, Meter, ReportToolbar, TextLink } from './common';

interface Row {
  treatment_plan_id: number;
  plan_code: string;
  name: string;
  plan_type: string;
  patient_id: number;
  patient_code: string;
  patient_name: string;
  doctor_name: string;
  expected_sessions: number;
  completed_sessions: number;
  remaining_sessions: number;
  last_session_at: string | null;
  total_price: number;
  paid_amount: number;
  remaining_amount: number;
  started_on: string;
}

// BC-06: liệu trình đang dở — còn mấy buổi, còn bao nhiêu tiền
export function PlansInProgressReport() {
  const { data, loading, error } = useApi<{ rows: Row[] }>('/reports/plans-in-progress');
  const rows = data?.rows ?? [];
  const remainingSessions = rows.reduce((s, r) => s + r.remaining_sessions, 0);
  const remainingAmount = rows.reduce((s, r) => s + r.remaining_amount, 0);

  function exportCsv() {
    downloadCsv(
      'BC-06_lieu-trinh-dang-do.csv',
      ['Mã LT', 'Liệu trình', 'Loại', 'Mã BN', 'Bệnh nhân', 'Bác sĩ', 'Bắt đầu', 'Buổi đã làm', 'Buổi dự kiến', 'Còn lại (buổi)', 'Tổng giá', 'Đã thu', 'Còn lại (tiền)'],
      rows.map((r) => [
        r.plan_code,
        r.name,
        labelOf(PLAN_TYPE, r.plan_type).label,
        r.patient_code,
        r.patient_name,
        r.doctor_name,
        fmtDate(r.started_on),
        r.completed_sessions,
        r.expected_sessions,
        r.remaining_sessions,
        r.total_price,
        r.paid_amount,
        r.remaining_amount,
      ]),
    );
  }

  return (
    <>
      <ReportToolbar code="BC-06" question="Liệu trình nào đang dở, còn mấy buổi?">
        <CsvButton onClick={exportCsv} disabled={!rows.length} />
      </ReportToolbar>
      <AsyncBoundary loading={loading && !data} error={error}>
        <KpiRow>
          <StatCard label="Liệu trình đang điều trị" value={rows.length} />
          <StatCard label="Tổng buổi còn lại" value={remainingSessions} tone="blue" />
          <StatCard label="Tiền liệu trình còn phải thu" value={fmtMoney(remainingAmount)} tone="red" />
        </KpiRow>
        <Card title="Tiến độ liệu trình" bodyClassName="p-0">
          <DataTable
            rows={rows}
            rowKey={(r) => r.treatment_plan_id}
            empty="Không có liệu trình đang dở"
            columns={[
              {
                key: 'plan',
                header: 'Liệu trình',
                render: (r) => (
                  <>
                    <TextLink href={`/plans/${r.treatment_plan_id}`}>{r.name}</TextLink>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                      {r.plan_code} <StatusBadge label={labelOf(PLAN_TYPE, r.plan_type)} />
                    </div>
                  </>
                ),
              },
              {
                key: 'patient',
                header: 'Bệnh nhân',
                render: (r) => (
                  <>
                    <TextLink href={`/patients/${r.patient_id}`}>{r.patient_name}</TextLink>
                    <div className="text-xs text-slate-500">BS {r.doctor_name}</div>
                  </>
                ),
              },
              {
                key: 'sessions',
                header: 'Buổi',
                render: (r) => (
                  <Meter
                    value={r.completed_sessions}
                    max={r.expected_sessions}
                    label={`${r.completed_sessions}/${r.expected_sessions} buổi · còn ${r.remaining_sessions}`}
                  />
                ),
              },
              {
                key: 'payment',
                header: 'Thanh toán',
                render: (r) => (
                  <Meter
                    value={r.paid_amount}
                    max={r.total_price}
                    label={`${fmtMoney(r.paid_amount)} / ${fmtMoney(r.total_price)}`}
                  />
                ),
              },
              {
                key: 'dates',
                header: 'Thời gian',
                render: (r) => (
                  <div className="text-xs text-slate-600">
                    Bắt đầu {fmtDate(r.started_on)}
                    <div>Buổi gần nhất {fmtDate(r.last_session_at)}</div>
                  </div>
                ),
              },
            ]}
          />
        </Card>
      </AsyncBoundary>
    </>
  );
}
