'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { CalendarPlus, ClipboardPlus, Pencil, TriangleAlert } from 'lucide-react';
import { DocumentsTab } from '@/components/patients/DocumentsTab';
import { GuardiansSection } from '@/components/patients/GuardiansSection';
import { AppointmentsTab, InvoicesTab, PlansTab, TreatmentsTab } from '@/components/patients/HistoryTabs';
import type { PatientDetail } from '@/components/patients/types';
import {
  AsyncBoundary,
  Badge,
  Button,
  Card,
  DescriptionList,
  Loading,
  PageHeader,
  StatusBadge,
  Tabs,
} from '@/components/ui';
import { RequirePerm, useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { GENDER, labelOf, PATIENT_STATUS } from '@/lib/labels';

type TabKey = 'info' | 'appointments' | 'treatments' | 'plans' | 'invoices' | 'documents';
const TAB_KEYS: TabKey[] = ['info', 'appointments', 'treatments', 'plans', 'invoices', 'documents'];

export default function PatientProfilePage() {
  return (
    <RequirePerm perms={['BN-05']}>
      <Suspense fallback={<Loading />}>
        <PatientProfile />
      </Suspense>
    </RequirePerm>
  );
}

function PatientProfile() {
  const { id } = useParams<{ id: string }>();
  const patientId = Number(id);
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') as TabKey | null;
  const [tab, setTab] = useState<TabKey>(initialTab && TAB_KEYS.includes(initialTab) ? initialTab : 'info');
  const { can } = useAuth();
  const { data: p, loading, error, reload } = useApi<PatientDetail>(`/patients/${id}`);
  const under15 = p?.age !== null && p?.age !== undefined && p.age < 15;

  return (
    <AsyncBoundary loading={loading && !p} error={error}>
      {p && (
        <>
          <PageHeader
            title={
              <span className="flex flex-wrap items-center gap-2">
                {p.full_name}
                <StatusBadge label={labelOf(PATIENT_STATUS, p.status)} />
                {p.is_legacy && <Badge color="orange">Hồ sơ giấy {p.legacy_record_no ?? ''}</Badge>}
              </span>
            }
            subtitle={
              <>
                <span className="font-mono">{p.patient_code}</span>
                {p.date_of_birth && ` · ${fmtDate(p.date_of_birth)} (${p.age} tuổi)`}
                {p.gender && ` · ${labelOf(GENDER, p.gender).label}`}
                {` · SĐT ${p.phone ?? '—'}`}
              </>
            }
            actions={
              <>
                {can('BN-04') && (
                  <Link href={`/patients/${p.id}/edit`}>
                    <Button variant="secondary">
                      <Pencil className="h-4 w-4" /> Sửa
                    </Button>
                  </Link>
                )}
                {can('DT-05') && (
                  <Link href={`/plans/new?patient_id=${p.id}`}>
                    <Button variant="secondary">
                      <ClipboardPlus className="h-4 w-4" /> Tạo liệu trình
                    </Button>
                  </Link>
                )}
                {can('LH-02') && p.status === 'ACTIVE' && (
                  <Link href={`/appointments/new?patient_id=${p.id}`}>
                    <Button>
                      <CalendarPlus className="h-4 w-4" /> Đặt lịch
                    </Button>
                  </Link>
                )}
              </>
            }
          />

          {p.medical_history && (
            <div className="mb-4 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <span className="font-semibold">Tiền sử bệnh / dị ứng: </span>
                {p.medical_history}
              </div>
            </div>
          )}

          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryBox label="Khám gần nhất" value={fmtDate(p.summary.last_visit_at)} />
            <SummaryBox
              label="Lịch hẹn sắp tới"
              value={p.summary.upcoming_appointment ? fmtDateTime(p.summary.upcoming_appointment.start_at) : 'Chưa có'}
              hint={
                p.summary.upcoming_appointment
                  ? `${p.summary.upcoming_appointment.doctor_name} · ${p.summary.upcoming_appointment.chair_name}`
                  : undefined
              }
            />
            <SummaryBox label="Liệu trình đang điều trị" value={String(p.summary.active_plans)} />
            <SummaryBox
              label="Công nợ"
              value={fmtMoney(p.summary.total_debt)}
              tone={p.summary.total_debt > 0 ? 'text-red-600' : 'text-emerald-700'}
            />
          </div>

          <Tabs<TabKey>
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'info', label: 'Thông tin & người giám hộ' },
              { key: 'appointments', label: 'Lịch hẹn' },
              { key: 'treatments', label: 'Lịch sử điều trị' },
              { key: 'plans', label: 'Liệu trình' },
              { key: 'invoices', label: 'Hóa đơn & công nợ' },
              { key: 'documents', label: 'Tài liệu' },
            ]}
          />

          {tab === 'info' && (
            <div className="space-y-4">
              <Card title="Thông tin hành chính">
                <DescriptionList
                  items={[
                    { label: 'Họ và tên', value: p.full_name },
                    { label: 'Mã bệnh nhân', value: p.patient_code },
                    { label: 'Ngày sinh', value: p.date_of_birth ? `${fmtDate(p.date_of_birth)} (${p.age} tuổi)` : '—' },
                    { label: 'Giới tính', value: p.gender ? labelOf(GENDER, p.gender).label : '—' },
                    { label: 'SĐT liên hệ', value: p.phone ?? '—' },
                    { label: 'Email', value: p.email ?? '—' },
                    { label: 'Địa chỉ', value: p.address ?? '—' },
                    { label: 'Ghi chú', value: p.note ?? '—' },
                    ...(p.is_legacy ? [{ label: 'Số hồ sơ giấy', value: p.legacy_record_no ?? '—' }] : []),
                    ...(p.status === 'ARCHIVED' ? [{ label: 'Lưu trữ từ', value: fmtDateTime(p.archived_at) }] : []),
                    { label: 'Tạo hồ sơ', value: `${fmtDateTime(p.created_at)}${p.created_by_name ? ` · ${p.created_by_name}` : ''}` },
                    { label: 'Cập nhật', value: `${fmtDateTime(p.updated_at)}${p.updated_by_name ? ` · ${p.updated_by_name}` : ''}` },
                  ]}
                />
              </Card>
              <GuardiansSection patientId={patientId} guardians={p.guardians} under15={under15} onChanged={reload} />
            </div>
          )}
          {tab === 'appointments' && <AppointmentsTab patientId={patientId} />}
          {tab === 'treatments' && <TreatmentsTab patientId={patientId} />}
          {tab === 'plans' && <PlansTab patientId={patientId} />}
          {tab === 'invoices' && <InvoicesTab patientId={patientId} />}
          {tab === 'documents' && <DocumentsTab patientId={patientId} />}
        </>
      )}
    </AsyncBoundary>
  );
}

function SummaryBox({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 font-semibold ${tone ?? 'text-slate-900'}`}>{value}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  );
}
