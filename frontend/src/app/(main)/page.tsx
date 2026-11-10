'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Boxes, CalendarDays, CalendarPlus, FileText, ListOrdered, Receipt, UserRoundCheck, Wallet } from 'lucide-react';
import {
  AsyncBoundary,
  Button,
  Card,
  DataTable,
  PageHeader,
  StatCard,
  StatusBadge,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fmtMoney, fmtTime, todayStr, weekdayOf, fmtDate } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { APPOINTMENT_SOURCE, APPOINTMENT_STATUS, labelOf } from '@/lib/labels';

interface DashboardData {
  /** null = người xem không có quyền với số liệu đó */
  stats: {
    appointments_today: number;
    waiting: number;
    pending_payment: number | null;
    open_debt: number | null;
    collected_today: number | null;
    low_stock: number | null;
  };
  schedule: {
    booking_group_id: string;
    appointment_id: number;
    start_at: string;
    end_at: string;
    status: string;
    source: string;
    patient_id: number;
    patient_code: string;
    patient_name: string;
    doctor_name: string;
    chair_name: string;
    service_name: string | null;
  }[];
}

export default function DashboardPage() {
  const { user, can } = useAuth();
  const router = useRouter();
  const { data, loading, error } = useApi<DashboardData>('/dashboard');
  const today = todayStr();
  const s = data?.stats;

  return (
    <>
      <PageHeader
        title={`Xin chào, ${user.name}`}
        subtitle={`${weekdayOf(today)}, ${fmtDate(today)}`}
        actions={
          <>
            {can('LH-02') && (
              <Link href="/appointments/new">
                <Button>
                  <CalendarPlus className="h-4 w-4" /> Đặt lịch
                </Button>
              </Link>
            )}
            {can('LH-08') && (
              <Link href="/reception">
                <Button variant="secondary">
                  <UserRoundCheck className="h-4 w-4" /> Tiếp đón
                </Button>
              </Link>
            )}
          </>
        }
      />
      <AsyncBoundary loading={loading && !data} error={error}>
        {s && (
          <div className="mb-6 grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
            <StatCard label="Lịch hôm nay" value={s.appointments_today} icon={<CalendarDays className="h-5 w-5" />} href="/appointments" />
            <StatCard label="Đang chờ khám" value={s.waiting} tone="yellow" icon={<ListOrdered className="h-5 w-5" />} href={can('DT-01') ? '/queue' : undefined} />
            {s.pending_payment !== null && (
              <StatCard label="Chờ thanh toán" value={s.pending_payment} tone="purple" icon={<FileText className="h-5 w-5" />} href="/billing" />
            )}
            {s.collected_today !== null && (
              <StatCard label="Đã thu hôm nay" value={fmtMoney(s.collected_today)} tone="green" icon={<Receipt className="h-5 w-5" />} href={can('TT-04', 'TT-06') ? '/invoices' : undefined} />
            )}
            {s.open_debt !== null && (
              <StatCard label="Công nợ" value={fmtMoney(s.open_debt)} tone="red" icon={<Wallet className="h-5 w-5" />} href={can('TT-06') ? '/debts' : undefined} />
            )}
            {s.low_stock !== null && (
              <StatCard label="Vật tư dưới ngưỡng" value={s.low_stock} tone="blue" icon={<Boxes className="h-5 w-5" />} href={can('QT-04') ? '/admin/inventory' : '/reports?tab=BC-07'} />
            )}
          </div>
        )}
        <Card title={user.role === 'DOCTOR' ? 'Lịch khám của tôi hôm nay' : 'Lịch hẹn hôm nay'} bodyClassName="p-0">
          <DataTable
            rows={data?.schedule}
            rowKey={(r) => r.booking_group_id}
            empty="Hôm nay chưa có lịch hẹn"
            onRowClick={can('BN-05') ? (r) => router.push(`/patients/${r.patient_id}`) : undefined}
            columns={[
              { key: 'time', header: 'Giờ', render: (r) => `${fmtTime(r.start_at)}–${fmtTime(r.end_at)}` },
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
              { key: 'service', header: 'Dịch vụ dự kiến', render: (r) => r.service_name ?? '—' },
              { key: 'doctor', header: 'Bác sĩ', render: (r) => r.doctor_name },
              { key: 'chair', header: 'Ghế', render: (r) => r.chair_name },
              { key: 'source', header: 'Nguồn', render: (r) => <StatusBadge label={labelOf(APPOINTMENT_SOURCE, r.source)} /> },
              { key: 'status', header: 'Trạng thái', render: (r) => <StatusBadge label={labelOf(APPOINTMENT_STATUS, r.status)} /> },
            ]}
          />
        </Card>
      </AsyncBoundary>
    </>
  );
}
