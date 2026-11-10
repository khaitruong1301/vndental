'use client';

import { useMemo, useState } from 'react';
import { Search, UserPlus, UserRoundCheck, UserX } from 'lucide-react';
import { AppointmentDetailModal } from '@/components/appointments/AppointmentDetailModal';
import { CancelModal } from '@/components/appointments/CancelModal';
import type { AppointmentGroup, DaySchedule } from '@/components/appointments/types';
import { PatientPicker } from '@/components/PatientPicker';
import {
  Alert,
  AsyncBoundary,
  Button,
  Card,
  DataTable,
  Field,
  Input,
  PageHeader,
  Select,
  StatusBadge,
  Tabs,
  Textarea,
} from '@/components/ui';
import { api } from '@/lib/api';
import { RequirePerm, useAuth, useLookups } from '@/lib/auth';
import { fmtDate, fmtTime, timeStrOf, todayStr, weekdayOf } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';
import { APPOINTMENT_SOURCE, APPOINTMENT_STATUS, labelOf } from '@/lib/labels';
import type { PatientSummary } from '@/lib/types';

type TabKey = 'all' | 'BOOKED' | 'ARRIVED' | 'DONE' | 'CANCELLED';

function WalkInCard({ schedule, onDone }: { schedule: DaySchedule | null; onDone: () => void }) {
  const { services } = useLookups();
  const { run, busy } = useAction();
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [doctorId, setDoctorId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [slots, setSlots] = useState(1);
  const [note, setNote] = useState('');
  const [lastCreated, setLastCreated] = useState<AppointmentGroup | null>(null);

  const now = timeStrOf(new Date());
  const onShiftNow = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of schedule?.shifts ?? []) {
      if (s.start_time <= now && now < s.end_time) map.set(s.doctor_id, `${s.doctor_name} (đến ${s.end_time})`);
    }
    return [...map.entries()];
  }, [schedule, now]);

  function openNewPatient(keyword: string) {
    const param = /^\d+$/.test(keyword) ? `phone=${encodeURIComponent(keyword)}` : `name=${encodeURIComponent(keyword)}`;
    window.open(`/patients/new?${param}`, '_blank');
  }

  async function submit() {
    if (!patient || !doctorId) return;
    const created = await run(() =>
      api.post<AppointmentGroup>('/appointments/walk-in', {
        patient_id: patient.id,
        doctor_id: Number(doctorId),
        service_id: serviceId ? Number(serviceId) : null,
        slots,
        note,
      }),
    );
    if (!created) return;
    setLastCreated(created);
    setPatient(null);
    setServiceId('');
    setSlots(1);
    setNote('');
    onDone();
  }

  return (
    <Card title="Tiếp nhận khách vãng lai (LH-09)">
      <div className="space-y-3">
        {lastCreated && (
          <Alert kind="success" title="Đã tiếp nhận và đưa vào hàng chờ">
            {lastCreated.patient_name} · {lastCreated.start_time}–{lastCreated.end_time} · BS {lastCreated.doctor_name} ·{' '}
            {lastCreated.chair_name}
          </Alert>
        )}
        <Field label="Bệnh nhân" required>
          <PatientPicker value={patient} onChange={setPatient} onCreateNew={openNewPatient} />
        </Field>
        {onShiftNow.length === 0 ? (
          <Alert kind="warning">Hiện không có bác sĩ nào đang trong ca trực.</Alert>
        ) : (
          <Field label="Bác sĩ đang trực" required>
            <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              <option value="">— Chọn bác sĩ —</option>
              {onShiftNow.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Dịch vụ dự kiến" className="col-span-2">
            <Select
              value={serviceId}
              onChange={(e) => {
                setServiceId(e.target.value);
                setSlots(services.find((s) => String(s.id) === e.target.value)?.default_slots ?? 1);
              }}
            >
              <option value="">— Chưa xác định —</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Số khung">
            <Input
              type="number"
              min={1}
              max={12}
              value={slots}
              onChange={(e) => setSlots(Math.min(12, Math.max(1, Number(e.target.value) || 1)))}
            />
          </Field>
        </div>
        <Field label="Ghi chú">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: đau răng, đến không hẹn" />
        </Field>
        <p className="text-xs text-slate-500">
          Hệ thống tự xếp khung trống sớm nhất từ bây giờ của bác sĩ đã chọn (kèm ghế trống) và chuyển ngay sang «Đã đến».
        </p>
        <div className="flex justify-end">
          <Button loading={busy} disabled={!patient || !doctorId} onClick={submit}>
            <UserPlus className="h-4 w-4" /> Tiếp nhận
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ReceptionContent() {
  const { can } = useAuth();
  const today = todayStr();
  const { data, loading, error, reload } = useApi<DaySchedule>('/appointments', { date: today });
  const { run, busy } = useAction();
  const [tab, setTab] = useState<TabKey>('all');
  const [keyword, setKeyword] = useState('');
  const [detail, setDetail] = useState<AppointmentGroup | null>(null);
  const [noShow, setNoShow] = useState<AppointmentGroup | null>(null);

  const groups = data?.groups ?? [];
  const inTab = (g: AppointmentGroup, t: TabKey) =>
    t === 'all' ||
    (t === 'DONE' ? ['IN_TREATMENT', 'COMPLETED'].includes(g.status) : g.status === t);

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return groups.filter(
      (g) =>
        inTab(g, tab) &&
        (!kw ||
          g.patient_name.toLowerCase().includes(kw) ||
          g.patient_code.toLowerCase().includes(kw) ||
          (g.patient_phone ?? '').includes(kw)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, tab, keyword]);

  async function checkIn(g: AppointmentGroup) {
    const ok = await run(
      () => api.post(`/appointments/groups/${g.booking_group_id}/check-in`),
      `Đã tiếp đón ${g.patient_name} — chuyển vào hàng chờ khám`,
    );
    if (ok) reload();
  }

  const count = (t: TabKey) => groups.filter((g) => inTab(g, t)).length;

  return (
    <>
      <PageHeader
        title="Tiếp đón bệnh nhân"
        subtitle={`LH-08 · ${weekdayOf(today)}, ${fmtDate(today)} — check-in chuyển lịch sang «Đã đến» và đưa vào hàng chờ khám`}
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <Card bodyClassName="p-0">
            <div className="flex flex-wrap items-center gap-3 px-4 pt-3">
              <div className="relative w-72 max-w-full">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-9"
                  placeholder="Tìm theo tên, mã BN, SĐT..."
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                />
              </div>
            </div>
            <div className="px-4 pt-3">
              <Tabs<TabKey>
                value={tab}
                onChange={setTab}
                tabs={[
                  { key: 'all', label: 'Tất cả', count: count('all') },
                  { key: 'BOOKED', label: 'Chưa đến', count: count('BOOKED') },
                  { key: 'ARRIVED', label: 'Đang chờ khám', count: count('ARRIVED') },
                  { key: 'DONE', label: 'Đang khám / xong', count: count('DONE') },
                  { key: 'CANCELLED', label: 'Đã hủy', count: count('CANCELLED') },
                ]}
              />
            </div>
            <AsyncBoundary loading={loading && !data} error={error}>
              <DataTable
                rows={rows}
                rowKey={(g) => g.booking_group_id}
                onRowClick={setDetail}
                empty="Không có lịch hẹn"
                columns={[
                  {
                    key: 'time',
                    header: 'Giờ hẹn',
                    render: (g) => (
                      <span className="tabular-nums">
                        {g.start_time}–{g.end_time}
                      </span>
                    ),
                  },
                  {
                    key: 'patient',
                    header: 'Bệnh nhân',
                    render: (g) => (
                      <>
                        <div className="font-medium">{g.patient_name}</div>
                        <div className="text-xs text-slate-500">
                          {g.patient_code} · {g.patient_phone ?? '—'}
                        </div>
                      </>
                    ),
                  },
                  {
                    key: 'doctor',
                    header: 'Bác sĩ / ghế',
                    render: (g) => (
                      <>
                        <div>{g.doctor_name}</div>
                        <div className="text-xs text-slate-500">
                          {g.chair_name}
                          {g.service_name && ` · ${g.service_name}`}
                        </div>
                      </>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Trạng thái',
                    render: (g) => (
                      <div className="space-y-1">
                        <StatusBadge label={labelOf(APPOINTMENT_STATUS, g.status)} />
                        {g.source !== 'RECEPTION' && (
                          <div>
                            <StatusBadge label={labelOf(APPOINTMENT_SOURCE, g.source)} />
                          </div>
                        )}
                        {g.checked_in_at && <div className="text-xs text-slate-500">Đến lúc {fmtTime(g.checked_in_at)}</div>}
                      </div>
                    ),
                  },
                  {
                    key: 'actions',
                    header: '',
                    align: 'right',
                    render: (g) =>
                      g.status === 'BOOKED' && (
                        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {can('LH-08') && (
                            <Button size="sm" disabled={busy} onClick={() => checkIn(g)}>
                              <UserRoundCheck className="h-3.5 w-3.5" /> Tiếp đón
                            </Button>
                          )}
                          {can('LH-04') && (
                            <Button size="sm" variant="secondary" onClick={() => setNoShow(g)}>
                              <UserX className="h-3.5 w-3.5" /> Không đến
                            </Button>
                          )}
                        </div>
                      ),
                  },
                ]}
              />
            </AsyncBoundary>
          </Card>
        </div>
        {can('LH-09') && (
          <div className="min-w-0">
            <WalkInCard schedule={data} onDone={reload} />
          </div>
        )}
      </div>

      <AppointmentDetailModal group={detail} onClose={() => setDetail(null)} onChanged={reload} />
      <CancelModal
        group={noShow}
        noShow
        onClose={() => setNoShow(null)}
        onDone={() => {
          setNoShow(null);
          reload();
        }}
      />
    </>
  );
}

export default function ReceptionPage() {
  return (
    <RequirePerm perms={['LH-08']}>
      <ReceptionContent />
    </RequirePerm>
  );
}
