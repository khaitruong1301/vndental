'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { PatientForm, type PatientFormValues, EMPTY_PATIENT, toPatientPayload } from '@/components/patients/PatientForm';
import type { DuplicateCandidate } from '@/components/patients/types';
import { Alert, Button, DataTable, Loading, Modal, PageHeader, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { RequirePerm, useAuth } from '@/lib/auth';
import { fmtDate } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import { labelOf, PATIENT_STATUS } from '@/lib/labels';

export default function NewPatientPage() {
  return (
    <RequirePerm perms={['BN-02', 'BN-06']}>
      <Suspense fallback={<Loading />}>
        <NewPatient />
      </Suspense>
    </RequirePerm>
  );
}

function NewPatient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = useAuth();
  const legacy = searchParams.get('legacy') === '1' && can('BN-06');
  const { run, busy } = useAction();
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[] | null>(null);
  const [pending, setPending] = useState<PatientFormValues | null>(null);

  const initial: PatientFormValues = {
    ...EMPTY_PATIENT,
    phone: searchParams.get('phone') ?? '',
    full_name: searchParams.get('name') ?? '',
  };

  if (!legacy && !can('BN-02')) {
    return <Alert kind="warning">Bạn chỉ có quyền số hóa hồ sơ giấy. Mở trang với chế độ số hóa.</Alert>;
  }

  async function create(values: PatientFormValues) {
    const created = await run(
      () =>
        api.post<{ id: number; patient_code: string }>(
          '/patients',
          toPatientPayload(values, {
            is_legacy: legacy,
            last_visit_at: legacy && values.last_visit_at ? values.last_visit_at : null,
            guardians: values.guardians.map((g) => ({
              full_name: g.full_name.trim(),
              relationship: g.relationship.trim(),
              phone: g.phone.trim(),
              is_primary: g.is_primary,
              note: g.note.trim() || null,
            })),
          }),
        ),
      'Đã lưu hồ sơ bệnh nhân',
    );
    if (created) router.push(`/patients/${created.id}${legacy ? '?tab=documents' : ''}`);
  }

  // BN-02 «include» Kiểm tra trùng hồ sơ trước khi lưu
  async function handleSubmit(values: PatientFormValues) {
    const found = await run(() =>
      api.get<DuplicateCandidate[]>('/patients/check-duplicates', {
        full_name: values.full_name.trim(),
        phone: values.phone.trim(),
        date_of_birth: values.date_of_birth,
      }),
    );
    if (found === undefined) return;
    if (found.length > 0) {
      setPending(values);
      setDuplicates(found);
      return;
    }
    await create(values);
  }

  return (
    <>
      <PageHeader
        title={legacy ? 'Số hóa hồ sơ giấy cũ' : 'Đăng ký bệnh nhân mới'}
        subtitle={legacy ? 'BN-06 — nhập thông tin hành chính, đính kèm ảnh scan sau khi lưu' : 'BN-02 · BN-03 (người giám hộ khi dưới 15 tuổi)'}
      />
      <PatientForm
        mode="create"
        legacy={legacy}
        initial={initial}
        submitting={busy}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/patients')}
      />

      <Modal
        open={!!duplicates}
        onClose={() => setDuplicates(null)}
        title="Có thể trùng hồ sơ đã có"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDuplicates(null)}>
              Quay lại sửa
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                const values = pending;
                setDuplicates(null);
                if (values) await create(values);
              }}
            >
              Vẫn tạo hồ sơ mới
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Alert kind="warning">
            Hệ thống tìm thấy hồ sơ giống thông tin vừa nhập. Nếu đây là cùng một người, hãy mở hồ sơ cũ thay vì tạo mới.
            Nếu là người khác (vd. anh chị em dùng chung SĐT của mẹ), chọn «Vẫn tạo hồ sơ mới».
          </Alert>
          <DataTable
            rows={duplicates}
            rowKey={(r) => r.id}
            columns={[
              { key: 'code', header: 'Mã BN', render: (r) => <span className="font-mono text-xs">{r.patient_code}</span> },
              { key: 'name', header: 'Họ tên', render: (r) => <span className="font-medium">{r.full_name}</span> },
              { key: 'dob', header: 'Ngày sinh', render: (r) => fmtDate(r.date_of_birth) },
              { key: 'phone', header: 'SĐT', render: (r) => r.phone ?? '—' },
              { key: 'reason', header: 'Lý do nghi trùng', render: (r) => <span className="text-xs text-amber-700">{r.match_reason}</span> },
              { key: 'status', header: '', render: (r) => <StatusBadge label={labelOf(PATIENT_STATUS, r.status)} /> },
              {
                key: 'open',
                header: '',
                align: 'right',
                render: (r) => (
                  <Button size="sm" variant="secondary" onClick={() => router.push(`/patients/${r.id}`)}>
                    Mở hồ sơ này
                  </Button>
                ),
              },
            ]}
          />
        </div>
      </Modal>
    </>
  );
}
