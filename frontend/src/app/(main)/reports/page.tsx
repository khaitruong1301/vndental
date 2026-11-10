'use client';

import { type ComponentType, Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CancellationReport } from '@/components/reports/CancellationReport';
import { ChairUtilizationReport } from '@/components/reports/ChairUtilizationReport';
import { DebtReport } from '@/components/reports/DebtReport';
import { DoctorRevenueReport } from '@/components/reports/DoctorRevenueReport';
import { InactivePatientsReport } from '@/components/reports/InactivePatientsReport';
import { LowStockReport } from '@/components/reports/LowStockReport';
import { MonthlyRevenueReport } from '@/components/reports/MonthlyRevenueReport';
import { PlansInProgressReport } from '@/components/reports/PlansInProgressReport';
import { EmptyState, Loading, PageHeader, Tabs } from '@/components/ui';
import { useAuth } from '@/lib/auth';

type ReportCode = 'BC-01' | 'BC-02' | 'BC-03' | 'BC-04' | 'BC-05' | 'BC-06' | 'BC-07' | 'BC-08';

const REPORTS: { key: ReportCode; label: string; component: ComponentType }[] = [
  { key: 'BC-01', label: 'Doanh thu bác sĩ', component: DoctorRevenueReport },
  { key: 'BC-02', label: 'Công suất ghế', component: ChairUtilizationReport },
  { key: 'BC-03', label: 'BN lâu chưa quay lại', component: InactivePatientsReport },
  { key: 'BC-04', label: 'Hủy lịch', component: CancellationReport },
  { key: 'BC-05', label: 'Công nợ', component: DebtReport },
  { key: 'BC-06', label: 'Liệu trình đang dở', component: PlansInProgressReport },
  { key: 'BC-07', label: 'Vật tư sắp hết', component: LowStockReport },
  { key: 'BC-08', label: 'Doanh thu theo tháng', component: MonthlyRevenueReport },
];

function ReportsContent() {
  const { can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const allowed = REPORTS.filter((r) => can(r.key));
  if (!allowed.length) return <EmptyState title="Bạn không có quyền xem báo cáo nào" />;

  const requested = searchParams.get('tab');
  const active = allowed.find((r) => r.key === requested) ?? allowed[0];
  const Report = active.component;

  return (
    <>
      <Tabs
        tabs={allowed.map((r) => ({ key: r.key, label: r.label }))}
        value={active.key}
        onChange={(key) => router.replace(`${pathname}?tab=${key}`, { scroll: false })}
      />
      <Report key={active.key} />
    </>
  );
}

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Báo cáo" subtitle="Số liệu phục vụ quản lý phòng khám (BC-01 … BC-08)" />
      <Suspense fallback={<Loading />}>
        <ReportsContent />
      </Suspense>
    </>
  );
}
