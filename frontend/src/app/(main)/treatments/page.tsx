'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { AsyncBoundary, Card, DataTable, Field, Input, PageHeader, Select, StatusBadge, Tabs } from '@/components/ui';
import { RequirePerm, useAuth, useLookups } from '@/lib/auth';
import { addDays, fmtDateTime, todayStr } from '@/lib/format';
import { useApi, useDebounced } from '@/lib/hooks';
import { INVOICE_STATUS, labelOf, RECORD_STATUS } from '@/lib/labels';

interface RecordRow {
  id: number;
  record_code: string;
  visit_at: string;
  status: string;
  diagnosis: string | null;
  patient_id: number;
  patient_code: string;
  patient_name: string;
  doctor_name: string;
  chair_name: string | null;
  plan_code: string | null;
  plan_session_no: number | null;
  line_count: number;
  invoice_id: number | null;
  invoice_code: string | null;
  invoice_status: string | null;
}

type StatusTab = 'ALL' | 'DRAFT' | 'PENDING_PAYMENT' | 'INVOICED' | 'CANCELLED';

function TreatmentsContent() {
  const router = useRouter();
  const { doctors } = useLookups();
  const { can } = useAuth();
  const canViewInvoice = can('TT-01', 'TT-04', 'TT-06');
  const [status, setStatus] = useState<StatusTab>('ALL');
  const [dateFrom, setDateFrom] = useState(addDays(todayStr(), -30));
  const [dateTo, setDateTo] = useState(todayStr());
  const [doctorId, setDoctorId] = useState('');
  const [keyword, setKeyword] = useState('');
  const q = useDebounced(keyword.trim());

  const { data, loading, error } = useApi<{ rows: RecordRow[]; counts: Record<string, number> }>('/treatments', {
    status: status === 'ALL' ? undefined : status,
    date_from: dateFrom,
    date_to: dateTo,
    doctor_id: doctorId,
    q,
  });
  const counts = data?.counts ?? {};
  const total = Object.values(counts).reduce((s, n) => s + n, 0);

  return (
    <>
      <PageHeader title="Phiếu điều trị" subtitle="Tra cứu phiếu điều trị theo ngày khám, bác sĩ, trạng thái" />
      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Tìm kiếm">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input className="pl-9" placeholder="Tên, mã BN, SĐT, mã phiếu..." value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            </div>
          </Field>
          <Field label="Từ ngày">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </Field>
          <Field label="Đến ngày">
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </Field>
          <Field label="Bác sĩ">
            <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              <option value="">Tất cả</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Tabs<StatusTab>
        value={status}
        onChange={setStatus}
        tabs={[
          { key: 'ALL', label: 'Tất cả', count: total },
          { key: 'DRAFT', label: 'Nháp', count: counts.DRAFT ?? 0 },
          { key: 'PENDING_PAYMENT', label: 'Chờ thanh toán', count: counts.PENDING_PAYMENT ?? 0 },
          { key: 'INVOICED', label: 'Đã lập hóa đơn', count: counts.INVOICED ?? 0 },
          { key: 'CANCELLED', label: 'Đã hủy', count: counts.CANCELLED ?? 0 },
        ]}
      />

      <AsyncBoundary loading={false} error={error}>
        <Card bodyClassName="p-0">
          <DataTable
            rows={data?.rows}
            loading={loading}
            rowKey={(r) => r.id}
            onRowClick={(r) => router.push(`/treatments/${r.id}`)}
            empty="Không có phiếu điều trị phù hợp"
            columns={[
              { key: 'code', header: 'Mã phiếu', render: (r) => <span className="font-medium">{r.record_code}</span> },
              { key: 'visit', header: 'Ngày khám', render: (r) => fmtDateTime(r.visit_at) },
              {
                key: 'patient',
                header: 'Bệnh nhân',
                render: (r) => (
                  <>
                    <div className="font-medium">{r.patient_name}</div>
                    <div className="text-xs text-slate-500">{r.patient_code}</div>
                  </>
                ),
              },
              { key: 'doctor', header: 'Bác sĩ chính', render: (r) => r.doctor_name },
              { key: 'diag', header: 'Chẩn đoán', render: (r) => <span className="line-clamp-2">{r.diagnosis ?? '—'}</span> },
              { key: 'lines', header: 'Số dòng', align: 'right', render: (r) => r.line_count },
              {
                key: 'plan',
                header: 'Liệu trình',
                render: (r) => (r.plan_code ? `${r.plan_code} · buổi ${r.plan_session_no}` : '—'),
              },
              { key: 'status', header: 'Trạng thái', render: (r) => <StatusBadge label={labelOf(RECORD_STATUS, r.status)} /> },
              {
                key: 'invoice',
                header: 'Hóa đơn',
                render: (r) =>
                  r.invoice_id && !canViewInvoice ? (
                    <span>
                      {r.invoice_code}
                      <span className="ml-1">
                        <StatusBadge label={labelOf(INVOICE_STATUS, r.invoice_status)} />
                      </span>
                    </span>
                  ) : r.invoice_id ? (
                    <Link href={`/invoices/${r.invoice_id}`} onClick={(e) => e.stopPropagation()} className="text-teal-700 hover:underline">
                      {r.invoice_code}
                      <span className="ml-1">
                        <StatusBadge label={labelOf(INVOICE_STATUS, r.invoice_status)} />
                      </span>
                    </Link>
                  ) : (
                    '—'
                  ),
              },
            ]}
          />
        </Card>
      </AsyncBoundary>
    </>
  );
}

export default function TreatmentsPage() {
  return (
    <RequirePerm perms={['DT-02', 'TT-01', 'BN-05']}>
      <TreatmentsContent />
    </RequirePerm>
  );
}
