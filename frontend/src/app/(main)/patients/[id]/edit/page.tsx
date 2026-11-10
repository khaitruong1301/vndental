'use client';

import { useParams, useRouter } from 'next/navigation';
import { PatientForm, type PatientFormValues, toPatientPayload } from '@/components/patients/PatientForm';
import type { PatientDetail } from '@/components/patients/types';
import { AsyncBoundary, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { RequirePerm } from '@/lib/auth';
import { useAction, useApi } from '@/lib/hooks';

export default function EditPatientPage() {
  return (
    <RequirePerm perms={['BN-04']}>
      <EditPatient />
    </RequirePerm>
  );
}

function EditPatient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, loading, error } = useApi<PatientDetail>(`/patients/${id}`);
  const { run, busy } = useAction();

  async function save(values: PatientFormValues) {
    const ok = await run(
      () => api.put(`/patients/${id}`, toPatientPayload(values, { status: values.status })),
      'Đã cập nhật thông tin bệnh nhân',
    );
    if (ok) router.push(`/patients/${id}`);
  }

  return (
    <>
      <PageHeader
        title={data ? `Sửa hồ sơ: ${data.full_name}` : 'Sửa hồ sơ bệnh nhân'}
        subtitle={data ? `${data.patient_code} · BN-04` : 'BN-04'}
      />
      <AsyncBoundary loading={loading && !data} error={error}>
        {data && (
          <PatientForm
            mode="edit"
            legacy={data.is_legacy}
            submitting={busy}
            onSubmit={save}
            onCancel={() => router.push(`/patients/${id}`)}
            initial={{
              full_name: data.full_name,
              date_of_birth: data.date_of_birth ?? '',
              gender: data.gender ?? '',
              phone: data.phone ?? '',
              email: data.email ?? '',
              address: data.address ?? '',
              medical_history: data.medical_history ?? '',
              note: data.note ?? '',
              legacy_record_no: data.legacy_record_no ?? '',
              last_visit_at: '',
              status: data.status,
              guardians: [],
            }}
          />
        )}
      </AsyncBoundary>
    </>
  );
}
