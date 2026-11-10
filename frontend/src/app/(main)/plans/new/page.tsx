'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { InstallmentsEditor, installmentsPayload, installmentsValid } from '@/components/treatments/InstallmentsEditor';
import { type InstallmentDraft, newKey } from '@/components/treatments/types';
import { PatientPicker } from '@/components/PatientPicker';
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { RequirePerm, useAuth, useLookups } from '@/lib/auth';
import { fmtMoney, todayStr } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import type { PatientSummary } from '@/lib/types';

const PLAN_TYPES = [
  { value: 'ORTHODONTIC', label: 'Chỉnh nha (niềng răng)' },
  { value: 'IMPLANT', label: 'Implant' },
  { value: 'OTHER', label: 'Khác' },
];

function NewPlanForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const { services, doctors } = useLookups();
  const { run, busy } = useAction();

  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [doctorId, setDoctorId] = useState<string>(user.role === 'DOCTOR' ? String(user.id) : '');
  const [serviceId, setServiceId] = useState('');
  const [name, setName] = useState('');
  const [planType, setPlanType] = useState('ORTHODONTIC');
  const [totalPrice, setTotalPrice] = useState('');
  const [sessions, setSessions] = useState('');
  const [startedOn, setStartedOn] = useState(todayStr());
  const [note, setNote] = useState('');
  const [installments, setInstallments] = useState<InstallmentDraft[]>([]);

  // Điền sẵn bệnh nhân khi mở từ hồ sơ / phiếu điều trị
  useEffect(() => {
    const pid = params.get('patient_id');
    if (pid) api.get<PatientSummary>(`/patients/${pid}`).then(setPatient).catch(() => undefined);
  }, [params]);

  function chooseService(id: string) {
    setServiceId(id);
    const svc = services.find((s) => s.id === Number(id));
    if (!svc) return;
    if (!name) setName(svc.name.replace(/\s*\(trọn gói\)\s*/i, ''));
    if (svc.current_price) setTotalPrice(String(svc.current_price));
    if (/implant/i.test(svc.code + svc.name)) setPlanType('IMPLANT');
    else if (/niềng|chỉnh nha/i.test(svc.name + (svc.category ?? ''))) setPlanType('ORTHODONTIC');
  }

  const total = Number(totalPrice) || 0;
  const valid =
    !!patient && !!doctorId && name.trim() !== '' && total > 0 && Number(sessions) > 0 && installmentsValid(installments, total);

  async function submit() {
    const res = await run(
      () =>
        api.post<{ id: number }>('/plans', {
          patient_id: patient!.id,
          primary_doctor_id: Number(doctorId),
          service_id: serviceId ? Number(serviceId) : null,
          name,
          plan_type: planType,
          total_price: total,
          expected_sessions: Number(sessions),
          started_on: startedOn,
          note,
          installments: installmentsPayload(installments),
        }),
      'Đã tạo liệu trình',
    );
    if (res) router.push(`/plans/${res.id}`);
  }

  return (
    <>
      <PageHeader title="Tạo liệu trình" subtitle="DT-05 · Liệu trình trọn gói (niềng răng, implant) và kế hoạch các đợt thanh toán" />
      <div className="space-y-4">
        <Card title="Bệnh nhân">
          <PatientPicker value={patient} onChange={setPatient} autoFocus={!params.get('patient_id')} />
        </Card>
        <Card title="Thông tin liệu trình">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            <Field label="Dịch vụ trọn gói" hint="Chọn để điền sẵn tên và giá hiện hành">
              <Select value={serviceId} onChange={(e) => chooseService(e.target.value)}>
                <option value="">— Không chọn —</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {fmtMoney(s.current_price)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tên liệu trình" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Cấy ghép implant răng 46" />
            </Field>
            <Field label="Loại" required>
              <Select value={planType} onChange={(e) => setPlanType(e.target.value)}>
                {PLAN_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Bác sĩ phụ trách" required>
              <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                <option value="">— Chọn bác sĩ —</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tổng giá trọn gói (đ)" required>
              <Input type="number" min={0} step={100000} value={totalPrice} onChange={(e) => setTotalPrice(e.target.value)} />
            </Field>
            <Field label="Số buổi dự kiến" required>
              <Input type="number" min={1} value={sessions} onChange={(e) => setSessions(e.target.value)} />
            </Field>
            <Field label="Ngày bắt đầu">
              <Input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
            </Field>
            <Field label="Ghi chú" className="md:col-span-2">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        </Card>
        <Card
          title="Kế hoạch các đợt thanh toán"
          actions={
            total > 0 &&
            installments.length === 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setInstallments([{ key: newKey(), installment_no: 1, due_date: startedOn, amount: String(total), note: 'Thanh toán một lần' }])
                }
              >
                Một đợt duy nhất
              </Button>
            )
          }
        >
          <InstallmentsEditor value={installments} onChange={setInstallments} totalPrice={total} />
        </Card>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => router.back()}>
            Hủy
          </Button>
          <Button loading={busy} disabled={!valid} onClick={submit}>
            Tạo liệu trình
          </Button>
        </div>
      </div>
    </>
  );
}

export default function NewPlanPage() {
  return (
    <RequirePerm perms={['DT-05']}>
      <Suspense>
        <NewPlanForm />
      </Suspense>
    </RequirePerm>
  );
}
