'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Play, RefreshCw } from 'lucide-react';
import { AsyncBoundary, Badge, Button, Card, DataTable, PageHeader, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { RequirePerm, useAuth, useLookups } from '@/lib/auth';
import { ageOf, fmtTime } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';
import { labelOf, RECORD_STATUS } from '@/lib/labels';
import { StatusBadge } from '@/components/ui';

interface QueueRow {
  appointment_id: number;
  booking_group_id: string;
  checked_in_at: string | null;
  start_at: string;
  doctor_id: number;
  doctor_name: string;
  chair_name: string;
  patient_id: number;
  patient_code: string;
  patient_name: string;
  date_of_birth: string | null;
  service_name: string | null;
  medical_history?: string | null;
  record_id?: number | null;
  record_status?: string | null;
}

function PatientCell({ r }: { r: QueueRow }) {
  const age = ageOf(r.date_of_birth);
  return (
    <>
      <div className="font-medium text-slate-900">{r.patient_name}</div>
      <div className="text-xs text-slate-500">
        {r.patient_code}
        {age !== null && ` · ${age} tuổi`}
      </div>
      {r.medical_history && (
        <div className="mt-0.5">
          <Badge color="red">{r.medical_history}</Badge>
        </div>
      )}
    </>
  );
}

function QueueContent() {
  const { user, can } = useAuth();
  const { doctors } = useLookups();
  const router = useRouter();
  const [doctorId, setDoctorId] = useState<string>(user.role === 'DOCTOR' ? String(user.id) : '');
  const { data, loading, error, reload } = useApi<{ waiting: QueueRow[]; in_treatment: QueueRow[] }>('/treatments/queue', {
    doctor_id: doctorId,
  });
  const { run, busy } = useAction();

  // Hàng chờ tự làm mới mỗi 30 giây
  useEffect(() => {
    const t = setInterval(reload, 30_000);
    return () => clearInterval(t);
  }, [reload]);

  async function start(appointmentId: number) {
    const res = await run(() => api.post<{ id: number }>(`/treatments/from-appointment/${appointmentId}`));
    if (res) router.push(`/treatments/${res.id}`);
  }

  const common = [
    { key: 'checkin', header: 'Check-in', render: (r: QueueRow) => fmtTime(r.checked_in_at) },
    { key: 'slot', header: 'Giờ hẹn', render: (r: QueueRow) => fmtTime(r.start_at) },
    { key: 'patient', header: 'Bệnh nhân', render: (r: QueueRow) => <PatientCell r={r} /> },
    { key: 'service', header: 'Dịch vụ dự kiến', render: (r: QueueRow) => r.service_name ?? '—' },
    { key: 'doctor', header: 'Bác sĩ', render: (r: QueueRow) => r.doctor_name },
    { key: 'chair', header: 'Ghế', render: (r: QueueRow) => r.chair_name },
  ];

  return (
    <>
      <PageHeader
        title="Hàng chờ khám"
        subtitle="DT-01 · Bệnh nhân đã check-in hôm nay, theo thứ tự đến"
        actions={
          <>
            <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="w-56">
              <option value="">Tất cả bác sĩ</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                  {d.id === user.id ? ' (tôi)' : ''}
                </option>
              ))}
            </Select>
            <Button variant="secondary" onClick={reload} loading={loading}>
              <RefreshCw className="h-4 w-4" /> Làm mới
            </Button>
          </>
        }
      />
      <AsyncBoundary loading={loading && !data} error={error}>
        <div className="space-y-5">
          <Card title={`Đang chờ (${data?.waiting.length ?? 0})`} bodyClassName="p-0">
            <DataTable
              rows={data?.waiting}
              rowKey={(r) => r.booking_group_id}
              empty="Không có bệnh nhân đang chờ"
              columns={[
                ...common,
                {
                  key: 'action',
                  header: '',
                  align: 'right',
                  render: (r) =>
                    can('DT-02') && (
                      <Button size="sm" disabled={busy} onClick={() => start(r.appointment_id)}>
                        <Play className="h-3.5 w-3.5" /> Bắt đầu khám
                      </Button>
                    ),
                },
              ]}
            />
          </Card>
          <Card title={`Đang khám (${data?.in_treatment.length ?? 0})`} bodyClassName="p-0">
            <DataTable
              rows={data?.in_treatment}
              rowKey={(r) => r.booking_group_id}
              empty="Không có ca đang khám"
              columns={[
                ...common,
                {
                  key: 'record',
                  header: 'Phiếu',
                  render: (r) => (r.record_status ? <StatusBadge label={labelOf(RECORD_STATUS, r.record_status)} /> : '—'),
                },
                {
                  key: 'action',
                  header: '',
                  align: 'right',
                  render: (r) =>
                    r.record_id ? (
                      <Button size="sm" variant="secondary" onClick={() => router.push(`/treatments/${r.record_id}`)}>
                        <FileText className="h-3.5 w-3.5" /> Mở phiếu
                      </Button>
                    ) : (
                      can('DT-02') && (
                        <Button size="sm" disabled={busy} onClick={() => start(r.appointment_id)}>
                          <Play className="h-3.5 w-3.5" /> Tạo phiếu
                        </Button>
                      )
                    ),
                },
              ]}
            />
          </Card>
        </div>
      </AsyncBoundary>
    </>
  );
}

export default function QueuePage() {
  return (
    <RequirePerm perms={['DT-01']}>
      <QueueContent />
    </RequirePerm>
  );
}
