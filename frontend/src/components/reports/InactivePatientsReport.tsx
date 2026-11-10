'use client';

import { useState } from 'react';
import { AsyncBoundary, Badge, Card, DataTable, Select, StatCard } from '@/components/ui';
import { fmtDate, fmtNumber } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { CsvButton, downloadCsv, KpiRow, ReportToolbar, TextLink } from './common';

interface Row {
  patient_id: number;
  patient_code: string;
  full_name: string;
  date_of_birth: string | null;
  phone: string | null;
  is_legacy: boolean;
  last_visit_at: string;
  days_since_last_visit: number;
  guardian_name: string | null;
  guardian_relationship: string | null;
  guardian_phone: string | null;
}

// BC-03: bệnh nhân lâu chưa quay lại (để lễ tân gọi chăm sóc)
export function InactivePatientsReport() {
  const [months, setMonths] = useState(6);
  const { data, loading, error } = useApi<{ months: number; rows: Row[] }>('/reports/inactive-patients', { months });
  const rows = data?.rows ?? [];
  const avgDays = rows.length ? Math.round(rows.reduce((s, r) => s + r.days_since_last_visit, 0) / rows.length) : 0;

  function exportCsv() {
    downloadCsv(
      `BC-03_benh-nhan-qua-${months}-thang.csv`,
      ['Mã BN', 'Họ tên', 'Ngày sinh', 'SĐT', 'Người giám hộ', 'SĐT giám hộ', 'Lần khám cuối', 'Số ngày'],
      rows.map((r) => [
        r.patient_code,
        r.full_name,
        fmtDate(r.date_of_birth),
        r.phone,
        r.guardian_name ? `${r.guardian_name} (${r.guardian_relationship})` : '',
        r.guardian_phone,
        fmtDate(r.last_visit_at),
        r.days_since_last_visit,
      ]),
    );
  }

  return (
    <>
      <ReportToolbar code="BC-03" question={`Bệnh nhân nào quá ${months} tháng chưa quay lại?`}>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Chưa quay lại từ
          <Select className="w-32" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {[3, 6, 9, 12, 24].map((m) => (
              <option key={m} value={m}>
                {m} tháng
              </option>
            ))}
          </Select>
        </label>
        <CsvButton onClick={exportCsv} disabled={!rows.length} />
      </ReportToolbar>
      <AsyncBoundary loading={loading && !data} error={error}>
        <KpiRow>
          <StatCard label="Bệnh nhân cần gọi lại" value={rows.length} tone="yellow" />
          <StatCard label="Số ngày vắng trung bình" value={rows.length ? `${fmtNumber(avgDays)} ngày` : '—'} tone="blue" />
        </KpiRow>
        <Card title="Danh sách gọi chăm sóc" bodyClassName="p-0">
          <DataTable
            rows={rows}
            rowKey={(r) => r.patient_id}
            empty="Không có bệnh nhân nào quá hạn — hoặc đều đã có lịch hẹn sắp tới"
            columns={[
              {
                key: 'patient',
                header: 'Bệnh nhân',
                render: (r) => (
                  <>
                    <TextLink href={`/patients/${r.patient_id}`}>{r.full_name}</TextLink>{' '}
                    {r.is_legacy && <Badge>Hồ sơ giấy</Badge>}
                    <div className="text-xs text-slate-500">
                      {r.patient_code} · {fmtDate(r.date_of_birth)}
                    </div>
                  </>
                ),
              },
              { key: 'phone', header: 'SĐT', render: (r) => r.phone ?? '—' },
              {
                key: 'guardian',
                header: 'Người giám hộ',
                render: (r) =>
                  r.guardian_name ? (
                    <>
                      {r.guardian_name} ({r.guardian_relationship})
                      <div className="text-xs text-slate-500">{r.guardian_phone}</div>
                    </>
                  ) : (
                    '—'
                  ),
              },
              { key: 'last', header: 'Lần khám cuối', render: (r) => fmtDate(r.last_visit_at) },
              { key: 'days', header: 'Số ngày', align: 'right', render: (r) => fmtNumber(r.days_since_last_visit) },
            ]}
          />
          <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
            Chỉ gồm hồ sơ đang theo dõi và chưa có lịch hẹn sắp tới.
          </p>
        </Card>
      </AsyncBoundary>
    </>
  );
}
