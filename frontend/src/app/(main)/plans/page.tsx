'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { ProgressBar } from '@/components/treatments/ProgressBar';
import { AsyncBoundary, Button, Card, DataTable, Input, PageHeader, StatusBadge, Tabs } from '@/components/ui';
import { RequirePerm, useAuth } from '@/lib/auth';
import { fmtDate, fmtMoney } from '@/lib/format';
import { useApi, useDebounced } from '@/lib/hooks';
import { labelOf, PLAN_STATUS, PLAN_TYPE } from '@/lib/labels';

interface PlanRow {
  id: number;
  plan_code: string;
  name: string;
  plan_type: string;
  status: string;
  total_price: number;
  expected_sessions: number;
  started_on: string;
  ended_on: string | null;
  patient_id: number;
  patient_code: string;
  patient_name: string;
  doctor_name: string;
  service_name: string | null;
  completed_sessions: number;
  paid_amount: number;
  invoice_id: number | null;
}

type StatusTab = 'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

function PlansContent() {
  const { can } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<StatusTab>('ACTIVE');
  const [keyword, setKeyword] = useState('');
  const q = useDebounced(keyword.trim());
  const { data, loading, error } = useApi<{ rows: PlanRow[]; counts: Record<string, number> }>('/plans', {
    status: status === 'ALL' ? undefined : status,
    q,
  });
  const counts = data?.counts ?? {};

  return (
    <>
      <PageHeader
        title="Liệu trình"
        subtitle="DT-05 · Niềng răng, implant: tổng giá trọn gói, số buổi dự kiến, các đợt thanh toán"
        actions={
          can('DT-05') && (
            <Link href="/plans/new">
              <Button>
                <Plus className="h-4 w-4" /> Tạo liệu trình
              </Button>
            </Link>
          )
        }
      />
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <Tabs<StatusTab>
          value={status}
          onChange={setStatus}
          tabs={[
            { key: 'ACTIVE', label: 'Đang điều trị', count: counts.ACTIVE ?? 0 },
            { key: 'COMPLETED', label: 'Đã kết thúc', count: counts.COMPLETED ?? 0 },
            { key: 'CANCELLED', label: 'Đã hủy', count: counts.CANCELLED ?? 0 },
            { key: 'ALL', label: 'Tất cả', count: Object.values(counts).reduce((s, n) => s + n, 0) },
          ]}
        />
        <div className="relative mb-4 w-72">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input className="pl-9" placeholder="Tên BN, mã BN, mã liệu trình..." value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </div>
      </div>
      <AsyncBoundary loading={false} error={error}>
        <Card bodyClassName="p-0">
          <DataTable
            rows={data?.rows}
            loading={loading}
            rowKey={(r) => r.id}
            onRowClick={(r) => router.push(`/plans/${r.id}`)}
            empty="Không có liệu trình"
            columns={[
              {
                key: 'plan',
                header: 'Liệu trình',
                render: (r) => (
                  <>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-slate-500">
                      {r.plan_code} · bắt đầu {fmtDate(r.started_on)}
                    </div>
                  </>
                ),
              },
              { key: 'type', header: 'Loại', render: (r) => <StatusBadge label={labelOf(PLAN_TYPE, r.plan_type)} /> },
              {
                key: 'patient',
                header: 'Bệnh nhân',
                render: (r) => (
                  <>
                    <div>{r.patient_name}</div>
                    <div className="text-xs text-slate-500">{r.patient_code}</div>
                  </>
                ),
              },
              { key: 'doctor', header: 'Bác sĩ phụ trách', render: (r) => r.doctor_name },
              {
                key: 'progress',
                header: 'Tiến độ',
                render: (r) => (
                  <div className="w-36">
                    <div className="mb-1 text-xs text-slate-600">
                      {r.completed_sessions}/{r.expected_sessions} buổi
                    </div>
                    <ProgressBar value={r.completed_sessions} max={r.expected_sessions} />
                  </div>
                ),
              },
              {
                key: 'paid',
                header: 'Đã thu / tổng',
                align: 'right',
                render: (r) => (
                  <>
                    <div className="font-medium">{fmtMoney(r.paid_amount)}</div>
                    <div className="text-xs text-slate-500">/ {fmtMoney(r.total_price)}</div>
                  </>
                ),
              },
              { key: 'status', header: 'Trạng thái', render: (r) => <StatusBadge label={labelOf(PLAN_STATUS, r.status)} /> },
            ]}
          />
        </Card>
      </AsyncBoundary>
    </>
  );
}

export default function PlansPage() {
  return (
    <RequirePerm perms={['DT-05', 'DT-02', 'TT-01', 'BN-05']}>
      <PlansContent />
    </RequirePerm>
  );
}
