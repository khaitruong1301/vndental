'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { SlotPicker } from '@/components/appointments/SlotPicker';
import type { SlotChoice } from '@/components/appointments/types';
import { PatientPicker } from '@/components/PatientPicker';
import { Alert, Button, Card, Field, Input, PageHeader, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { RequirePerm, useAuth, useLookups } from '@/lib/auth';
import { fmtDate, fmtMoney, todayStr, weekdayOf } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import type { PatientSummary } from '@/lib/types';

function NewAppointmentForm() {
  const { user } = useAuth();
  const { doctors, services, chairs } = useLookups();
  const router = useRouter();
  const sp = useSearchParams();
  const { run, busy } = useAction();

  const qDoctor = sp.get('doctor_id') ?? (user.role === 'DOCTOR' ? String(user.id) : '');
  const qTime = sp.get('time');
  const qChair = sp.get('chair_id') ? Number(sp.get('chair_id')) : null;
  const qService = sp.get('service_id') ?? '';
  const initialSlots = services.find((s) => String(s.id) === qService)?.default_slots ?? 1;

  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [serviceId, setServiceId] = useState(qService);
  const [slots, setSlots] = useState(initialSlots);
  const [doctorId, setDoctorId] = useState(qDoctor);
  const [date, setDate] = useState(sp.get('date') || todayStr());
  const [note, setNote] = useState('');
  const [slotRefresh, setSlotRefresh] = useState(0);
  const [choice, setChoice] = useState<SlotChoice | null>(
    qDoctor && qTime && qChair ? { doctor_id: Number(qDoctor), start_time: qTime, chair_id: qChair } : null,
  );

  useEffect(() => {
    const id = sp.get('patient_id');
    if (!id) return;
    api
      .get<PatientSummary>(`/patients/${id}`)
      .then(setPatient)
      .catch(() => undefined);
  }, [sp]);

  const service = services.find((s) => String(s.id) === serviceId);
  const resetChoice = () => setChoice(null);

  function openNewPatient(keyword: string) {
    const param = /^\d+$/.test(keyword) ? `phone=${encodeURIComponent(keyword)}` : `name=${encodeURIComponent(keyword)}`;
    window.open(`/patients/new?${param}`, '_blank');
  }

  async function submit() {
    if (!patient || !choice) return;
    const created = await run(
      () =>
        api.post('/appointments', {
          patient_id: patient.id,
          doctor_id: choice.doctor_id,
          chair_id: choice.chair_id,
          service_id: serviceId ? Number(serviceId) : null,
          date,
          start_time: choice.start_time,
          slots,
          note,
        }),
      `Đã đặt lịch cho ${patient.full_name} lúc ${choice.start_time} ${fmtDate(date)}`,
    );
    if (created) router.push(`/appointments?date=${date}`);
    else {
      // LH-02 luồng 5a: báo lỗi rồi quay lại bước chọn khung với danh sách khung trống mới
      setChoice(null);
      setSlotRefresh((k) => k + 1);
    }
  }

  return (
    <>
      <PageHeader
        title={user.role === 'DOCTOR' ? 'Hẹn tái khám' : 'Đặt lịch hẹn'}
        subtitle="LH-02 · Mỗi lịch gắn 1 bệnh nhân, 1 bác sĩ, 1 ghế; việc dài đặt nhiều khung 30 phút liên tiếp"
      />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          <Card title="1. Bệnh nhân">
            <PatientPicker value={patient} onChange={setPatient} onCreateNew={openNewPatient} autoFocus />
            <p className="mt-2 text-xs text-slate-500">
              Một SĐT có thể thuộc nhiều bệnh nhân — chọn đúng người theo họ tên và ngày sinh. Khách mới: bấm «Đăng ký bệnh
              nhân mới» (mở tab mới), lưu xong quay lại tìm theo SĐT.
            </p>
          </Card>
          <Card title="2. Dịch vụ & bác sĩ">
            <div className="space-y-3">
              <Field label="Dịch vụ dự kiến">
                <Select
                  value={serviceId}
                  onChange={(e) => {
                    setServiceId(e.target.value);
                    setSlots(services.find((s) => String(s.id) === e.target.value)?.default_slots ?? 1);
                    resetChoice();
                  }}
                >
                  <option value="">— Chưa xác định —</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.current_price !== null ? ` · ${fmtMoney(s.current_price)}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Số khung 30 phút"
                hint={service ? `Gợi ý cho «${service.name}»: ${service.default_slots} khung` : 'Việc lâu (implant...) đặt nhiều khung'}
              >
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={slots}
                  onChange={(e) => {
                    setSlots(Math.min(12, Math.max(1, Number(e.target.value) || 1)));
                    resetChoice();
                  }}
                />
              </Field>
              <Field label="Bác sĩ">
                <Select
                  value={doctorId}
                  onChange={(e) => {
                    setDoctorId(e.target.value);
                    resetChoice();
                  }}
                >
                  <option value="">Bất kỳ bác sĩ đang trực</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name}
                      {d.is_part_time ? ' (bán thời gian)' : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Ghi chú">
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: khách xin khung sáng sớm" />
              </Field>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Card
            title="3. Ngày & khung giờ trống"
            actions={
              <Input
                type="date"
                className="w-44"
                min={todayStr()}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  resetChoice();
                }}
              />
            }
          >
            <p className="mb-3 text-sm text-slate-600">
              {weekdayOf(date)}, {fmtDate(date)} — chỉ hiện khung trong ca trực, bác sĩ rảnh và còn ghế trống.
            </p>
            {qTime && !choice && (
              <div className="mb-3">
                <Alert kind="info">
                  Ô đã chọn từ lịch: {qTime}
                  {qChair && ` · ${chairs.find((c) => c.id === qChair)?.name ?? ''}`} — chọn bác sĩ/khung bên dưới.
                </Alert>
              </div>
            )}
            <SlotPicker
              date={date}
              doctorId={doctorId ? Number(doctorId) : null}
              slots={slots}
              value={choice}
              onChange={setChoice}
              preferredChairId={qChair}
              refreshKey={slotRefresh}
            />
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" onClick={() => router.back()}>
                Hủy
              </Button>
              <Button loading={busy} disabled={!patient || !choice} onClick={submit}>
                <CalendarCheck className="h-4 w-4" /> Lưu lịch hẹn
              </Button>
            </div>
            {!patient && <p className="mt-2 text-right text-xs text-slate-500">Chọn bệnh nhân trước khi lưu.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}

export default function NewAppointmentPage() {
  return (
    <RequirePerm perms={['LH-02']}>
      <Suspense>
        <NewAppointmentForm />
      </Suspense>
    </RequirePerm>
  );
}
