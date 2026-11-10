'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { AppointmentDetailModal } from '@/components/appointments/AppointmentDetailModal';
import { addMinutes, type AppointmentGroup, DAY_SLOTS, type DaySchedule } from '@/components/appointments/types';
import {
  AsyncBoundary,
  Badge,
  Button,
  Card,
  Checkbox,
  cn,
  DataTable,
  Input,
  PageHeader,
  Select,
  StatusBadge,
} from '@/components/ui';
import { RequirePerm, useAuth, useLookups } from '@/lib/auth';
import { addDays, fmtDate, fmtDateTime, timeStrOf, todayStr, weekdayOf } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { APPOINTMENT_STATUS, labelOf } from '@/lib/labels';

const ROW_HEIGHT = 40;

const BLOCK_STYLE: Record<string, string> = {
  BOOKED: 'border-blue-300 bg-blue-50 text-blue-900',
  ARRIVED: 'border-amber-300 bg-amber-50 text-amber-900',
  IN_TREATMENT: 'border-purple-300 bg-purple-50 text-purple-900',
  COMPLETED: 'border-emerald-300 bg-emerald-50 text-emerald-900',
};

function SchedulePage() {
  const { can } = useAuth();
  const { doctors } = useLookups();
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = todayStr();
  const date = searchParams.get('date') || today;
  const [doctorFilter, setDoctorFilter] = useState('');
  const [showCancelled, setShowCancelled] = useState(false);
  const [detail, setDetail] = useState<AppointmentGroup | null>(null);
  const { data, loading, error, reload } = useApi<DaySchedule>('/appointments', { date });

  const setDate = (d: string) => router.replace(`/appointments?date=${d}`);
  const filterId = doctorFilter ? Number(doctorFilter) : null;
  const nowTime = date === today ? timeStrOf(new Date()) : null;
  const isPastDay = date < today;

  const active = useMemo(() => (data?.groups ?? []).filter((g) => g.status !== 'CANCELLED'), [data]);
  const cancelled = useMemo(() => (data?.groups ?? []).filter((g) => g.status === 'CANCELLED'), [data]);

  /** chair_id|HH:mm → nhóm lịch đang chiếm ô */
  const occupied = useMemo(() => {
    const map = new Map<string, AppointmentGroup>();
    for (const g of active) {
      for (let i = 0; i < g.slots; i++) map.set(`${g.chair_id}|${addMinutes(g.start_time, i * 30)}`, g);
    }
    return map;
  }, [active]);

  /** doctor_id|HH:mm → bác sĩ đã có lịch ở khung đó (không cho đặt trùng — LH-07) */
  const doctorBusy = useMemo(() => {
    const set = new Set<string>();
    for (const g of active) {
      for (let i = 0; i < g.slots; i++) set.add(`${g.doctor_id}|${addMinutes(g.start_time, i * 30)}`);
    }
    return set;
  }, [active]);

  const doctorsOnShift = (time: string) =>
    (data?.shifts ?? []).filter(
      (s) => s.start_time <= time && addMinutes(time, 30) <= s.end_time && (!filterId || s.doctor_id === filterId),
    );

  const shiftSummary = (shift: 'MORNING' | 'AFTERNOON') =>
    (data?.shifts ?? []).filter((s) => s.shift === shift);

  const chairs = data?.chairs ?? [];

  return (
    <>
      <PageHeader
        title="Lịch hẹn"
        subtitle="LH-01 · Lịch theo ngày, theo ghế; bấm ô trống trong ca trực để đặt lịch, bấm lịch để xem/đổi/hủy"
        actions={
          can('LH-02') && (
            <Link href={`/appointments/new?date=${date}${doctorFilter ? `&doctor_id=${doctorFilter}` : ''}`}>
              <Button>
                <CalendarPlus className="h-4 w-4" /> Đặt lịch
              </Button>
            </Link>
          )
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setDate(addDays(date, -1))} aria-label="Ngày trước">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDate(today)} disabled={date === today}>
            Hôm nay
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDate(addDays(date, 1))} aria-label="Ngày sau">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Input type="date" className="w-44" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <span className="text-sm font-medium text-slate-700">
            {weekdayOf(date)}, {fmtDate(date)}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <Select className="w-52" value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)}>
              <option value="">Tất cả bác sĩ</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </Select>
            <Checkbox label={`Hiện lịch đã hủy (${cancelled.length})`} checked={showCancelled} onChange={setShowCancelled} />
          </div>
        </div>
        {data && (
          <div className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
            {(['MORNING', 'AFTERNOON'] as const).map((shift) => (
              <div key={shift} className="flex flex-wrap items-center gap-1.5">
                <span className="w-20 text-slate-500">{shift === 'MORNING' ? 'Ca sáng' : 'Ca chiều'}:</span>
                {shiftSummary(shift).length ? (
                  shiftSummary(shift).map((s) => (
                    <Badge key={s.id} color={filterId === s.doctor_id ? 'teal' : 'gray'}>
                      {s.doctor_name} ({s.start_time}–{s.end_time})
                    </Badge>
                  ))
                ) : (
                  <span className="text-slate-400">Không có bác sĩ trực</span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <AsyncBoundary loading={loading && !data} error={error}>
        <Card bodyClassName="p-0">
          <div className="overflow-x-auto">
            <div
              className="grid min-w-[640px]"
              style={{
                gridTemplateColumns: `72px repeat(${chairs.length}, minmax(170px, 1fr))`,
                gridTemplateRows: `36px repeat(${DAY_SLOTS.length}, ${ROW_HEIGHT}px)`,
              }}
            >
              <div className="sticky left-0 z-10 border-b border-r border-slate-200 bg-slate-50" />
              {chairs.map((c, ci) => (
                <div
                  key={c.id}
                  className="flex items-center justify-center border-b border-r border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600"
                  style={{ gridRow: 1, gridColumn: ci + 2 }}
                >
                  {c.name}
                </div>
              ))}

              {DAY_SLOTS.map((time, ri) => {
                const onShift = doctorsOnShift(time);
                const available = onShift.filter((s) => !doctorBusy.has(`${s.doctor_id}|${time}`));
                const past = isPastDay || (nowTime !== null && time < nowTime);
                return [
                  <div
                    key={`t-${time}`}
                    className={cn(
                      'sticky left-0 z-10 border-b border-r border-slate-200 bg-white pr-2 pt-1 text-right text-xs tabular-nums',
                      time.endsWith(':00') ? 'font-medium text-slate-700' : 'text-slate-400',
                    )}
                    style={{ gridRow: ri + 2, gridColumn: 1 }}
                  >
                    {time}
                  </div>,
                  ...chairs.map((c, ci) => {
                    const free = !occupied.has(`${c.id}|${time}`);
                    const bookable = free && available.length > 0 && !past && can('LH-02');
                    return (
                      <div
                        key={`${c.id}-${time}`}
                        style={{ gridRow: ri + 2, gridColumn: ci + 2 }}
                        className={cn(
                          'border-b border-r border-slate-100',
                          onShift.length ? 'bg-white' : 'bg-slate-50 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,#e2e8f0_6px,#e2e8f0_7px)]',
                          bookable && 'cursor-pointer hover:bg-teal-50',
                        )}
                        title={
                          bookable
                            ? `Đặt lịch ${time} · ${c.name} · Bác sĩ rảnh: ${available.map((s) => s.doctor_name).join(', ')}`
                            : onShift.length
                              ? undefined
                              : 'Ngoài ca trực'
                        }
                        onClick={
                          bookable
                            ? () =>
                                router.push(
                                  `/appointments/new?date=${date}&time=${time}&chair_id=${c.id}${doctorFilter ? `&doctor_id=${doctorFilter}` : ''}`,
                                )
                            : undefined
                        }
                      />
                    );
                  }),
                ];
              })}

              {active.map((g) => {
                const row = DAY_SLOTS.indexOf(g.start_time);
                const col = chairs.findIndex((c) => c.id === g.chair_id);
                if (row < 0 || col < 0) return null;
                const dimmed = filterId !== null && g.doctor_id !== filterId;
                return (
                  <button
                    key={g.booking_group_id}
                    type="button"
                    onClick={() => setDetail(g)}
                    style={{ gridRow: `${row + 2} / span ${g.slots}`, gridColumn: col + 2 }}
                    className={cn(
                      'z-[5] m-0.5 overflow-hidden rounded-md border px-2 py-1 text-left text-xs shadow-sm transition hover:shadow-md',
                      BLOCK_STYLE[g.status],
                      dimmed && 'opacity-35',
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate font-semibold">{g.patient_name}</span>
                      <span className="shrink-0 tabular-nums opacity-70">
                        {g.start_time}–{g.end_time}
                      </span>
                    </div>
                    <div className="truncate opacity-80">
                      BS {g.doctor_name}
                      {g.service_name && ` · ${g.service_name}`}
                    </div>
                    {g.slots > 1 && <div className="truncate opacity-70">{labelOf(APPOINTMENT_STATUS, g.status).label}</div>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            {Object.keys(BLOCK_STYLE).map((s) => (
              <StatusBadge key={s} label={labelOf(APPOINTMENT_STATUS, s)} />
            ))}
            <span className="ml-2">Ô gạch chéo: ngoài ca trực</span>
          </div>
        </Card>

        {showCancelled && (
          <Card title={`Lịch đã hủy (${cancelled.length})`} className="mt-4" bodyClassName="p-0">
            <DataTable
              rows={cancelled}
              rowKey={(g) => g.booking_group_id}
              onRowClick={setDetail}
              empty="Không có lịch bị hủy"
              columns={[
                { key: 'time', header: 'Giờ', render: (g) => `${g.start_time}–${g.end_time}` },
                { key: 'patient', header: 'Bệnh nhân', render: (g) => g.patient_name },
                { key: 'doctor', header: 'Bác sĩ', render: (g) => g.doctor_name },
                { key: 'chair', header: 'Ghế', render: (g) => g.chair_name },
                {
                  key: 'reason',
                  header: 'Lý do',
                  render: (g) => (
                    <>
                      {g.is_no_show ? <Badge color="red">{g.cancel_reason_name}</Badge> : g.cancel_reason_name}
                      {g.cancel_note && <div className="text-xs text-slate-500">{g.cancel_note}</div>}
                    </>
                  ),
                },
                {
                  key: 'by',
                  header: 'Người hủy',
                  render: (g) => (
                    <>
                      {g.cancelled_by_name ?? '—'}
                      <div className="text-xs text-slate-500">{fmtDateTime(g.cancelled_at)}</div>
                    </>
                  ),
                },
              ]}
            />
          </Card>
        )}
      </AsyncBoundary>

      <AppointmentDetailModal group={detail} onClose={() => setDetail(null)} onChanged={reload} />
    </>
  );
}

export default function AppointmentsPage() {
  return (
    <RequirePerm perms={['LH-01']}>
      <Suspense>
        <SchedulePage />
      </Suspense>
    </RequirePerm>
  );
}
