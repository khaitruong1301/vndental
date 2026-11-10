'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FilePlus2 } from 'lucide-react';
import type { PendingRecord } from '@/components/billing/types';
import { Alert, AsyncBoundary, Badge, Button, Card, DataTable, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { RequirePerm } from '@/lib/auth';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';

export default function BillingPage() {
  return (
    <RequirePerm perms={['TT-01']}>
      <PendingRecords />
    </RequirePerm>
  );
}

function PendingRecords() {
  const router = useRouter();
  const { data, loading, error, reload } = useApi<PendingRecord[]>('/billing/pending-records');
  const { run } = useAction();
  const [creatingId, setCreatingId] = useState<number | null>(null);

  async function createInvoice(record: PendingRecord) {
    setCreatingId(record.id);
    const result = await run(
      () => api.post<{ id: number }>('/billing/invoices', { treatment_record_id: record.id }),
      `Đã lập hóa đơn cho phiếu ${record.record_code}`,
    );
    setCreatingId(null);
    if (result) router.push(`/invoices/${result.id}`);
    else reload();
  }

  return (
    <>
      <PageHeader
        title="Lập hóa đơn"
        subtitle="Phiếu điều trị đang «Chờ thanh toán» (TT-01)"
        actions={
          <Button variant="secondary" onClick={reload}>
            Làm mới
          </Button>
        }
      />
      <div className="mb-4">
        <Alert kind="info">
          Giá mỗi dòng dịch vụ/thuốc được chụp theo bảng giá đang hiệu lực tại thời điểm lập và lưu cố định vào hóa đơn
          (TT-02). Dòng thuộc liệu trình trọn gói tính 0 đ; thuốc «mua ngoài» không tính tiền. Số tiền dưới đây chỉ là tạm
          tính theo giá hôm nay.
        </Alert>
      </div>
      <AsyncBoundary loading={loading && !data} error={error}>
        <Card bodyClassName="p-0">
          <DataTable
            rows={data}
            rowKey={(r) => r.id}
            empty="Không có phiếu điều trị nào chờ thanh toán"
            columns={[
              {
                key: 'record',
                header: 'Phiếu',
                render: (r) => (
                  <>
                    <Link href={`/treatments/${r.id}`} className="font-medium text-teal-700 hover:underline">
                      {r.record_code}
                    </Link>
                    <div className="text-xs text-slate-500">{fmtDateTime(r.visit_at)}</div>
                  </>
                ),
              },
              {
                key: 'patient',
                header: 'Bệnh nhân',
                render: (r) => (
                  <>
                    <Link href={`/patients/${r.patient_id}`} className="font-medium hover:underline">
                      {r.patient_name}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {r.patient_code} · {r.phone ?? '—'}
                    </div>
                  </>
                ),
              },
              { key: 'doctor', header: 'Bác sĩ chính', render: (r) => r.doctor_name },
              {
                key: 'services',
                header: 'Nội dung',
                render: (r) => (
                  <div className="max-w-md">
                    <div>{r.services_summary ?? '—'}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {r.medicine_count > 0 && <Badge color="purple">{r.medicine_count} thuốc</Badge>}
                      {r.plan_code && (
                        <Badge color="teal">
                          {r.plan_code} · buổi {r.plan_session_no ?? '?'}
                        </Badge>
                      )}
                      {(r.service_missing_price || r.medicine_missing_price) && (
                        <Badge color="red">Có mục chưa có giá</Badge>
                      )}
                    </div>
                  </div>
                ),
              },
              {
                key: 'total',
                header: 'Tạm tính',
                align: 'right',
                render: (r) => <span className="font-medium">{fmtMoney(r.estimated_total)}</span>,
              },
              {
                key: 'action',
                header: '',
                align: 'right',
                render: (r) => (
                  <Button size="sm" loading={creatingId === r.id} disabled={creatingId !== null} onClick={() => createInvoice(r)}>
                    <FilePlus2 className="h-3.5 w-3.5" /> Lập hóa đơn
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      </AsyncBoundary>
    </>
  );
}
