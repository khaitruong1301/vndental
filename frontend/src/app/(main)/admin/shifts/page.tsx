'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Plus } from 'lucide-react';
import { useToast } from '@/components/toast';
import { Alert, AsyncBoundary, Badge, Button, Card, Input, PageHeader, cn } from '@/components/ui';
import { api } from '@/lib/api';
import { RequirePerm } from '@/lib/auth';
import { addDays, fmtDate, todayStr, weekdayOf } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';
import { labelOf, SHIFT } from '@/lib/labels';

type ShiftCode = 'MORNING' | 'AFTERNOON';

interface ShiftRow {
  id: number;
  doctor_id: number;
  work_date: string;
  shift: ShiftCode;
  start_time: string;
  end_time: string;
  note: string | null;
  appointment_count: number;
}

interface DoctorRow {
  id: number;
  staff_code: string;
  full_name: string;
  is_part_time: boolean;
  is_active: boolean;
  days_in_week: number;
  shifts_in_week: number;
}

interface WeekData {
  week_start: string;
  days: string[];
  doctors: DoctorRow[];
  shifts: ShiftRow[];
}

const SHIFTS: ShiftCode[] = ['MORNING', 'AFTERNOON'];
const PART_TIME_DAYS = 3; // bác sĩ bán thời gian 3 ngày/tuần

export default function ShiftsPage() {
  return (
    <RequirePerm perms={['QT-01']}>
      <ShiftBoard />
    </RequirePerm>
  );
}

function ShiftBoard() {
  const toast = useToast();
  const [weekStart, setWeekStart] = useState<string | null>(null); // null = tuần hiện tại (server tính)
  const { data, loading, error, reload } = useApi<WeekData>('/admin/shifts', { week_start: weekStart });
  const { run, busy } = useAction();
  const today = todayStr();
  const monday = data?.week_start;

  const shiftMap = useMemo(() => {
    const map = new Map<string, ShiftRow>();
    data?.shifts.forEach((s) => map.set(`${s.doctor_id}|${s.work_date}|${s.shift}`, s));
    return map;
  }, [data]);

  async function toggle(doctor: DoctorRow, date: string, shift: ShiftCode) {
    const existing = shiftMap.get(`${doctor.id}|${date}|${shift}`);
    const label = `${labelOf(SHIFT, shift).label.toLowerCase()} ${weekdayOf(date)} ${fmtDate(date)}`;
    if (existing) {
      if (!window.confirm(`Xóa ${label} của BS ${doctor.full_name}?`)) return;
      if (await run(() => api.del(`/admin/shifts/${existing.id}`), 'Đã xóa ca trực')) reload();
    } else {
      if (!doctor.is_active) return;
      const ok = await run(
        () => api.post('/admin/shifts', { doctor_id: doctor.id, work_date: date, shift }),
        `Đã thêm ${label}`,
      );
      if (ok) reload();
    }
  }

  async function copyPreviousWeek() {
    if (!monday) return;
    const from = addDays(monday, -7);
    if (!window.confirm(`Sao chép lịch trực tuần ${fmtDate(from)} sang tuần ${fmtDate(monday)}? Ca đã có sẽ được giữ nguyên.`))
      return;
    const result = await run(() =>
      api.post<{ created: number; source_count: number }>('/admin/shifts/copy-week', {
        from_week_start: from,
        to_week_start: monday,
      }),
    );
    if (result) {
      if (!result.source_count) toast.error(`Tuần trước (${fmtDate(from)}) chưa có ca trực nào để sao chép`);
      else if (!result.created) toast.success('Tuần này đã có đủ các ca của tuần trước');
      else toast.success(`Đã thêm ${result.created} ca từ tuần trước`);
      reload();
    }
  }

  return (
    <>
      <PageHeader
        title="Ca trực bác sĩ"
        subtitle="QT-01 · Lịch hẹn chỉ được xếp vào khung giờ bác sĩ có ca trực"
        actions={
          <Button variant="secondary" onClick={copyPreviousWeek} disabled={!monday || busy}>
            <Copy className="h-4 w-4" /> Sao chép tuần trước
          </Button>
        }
      />

      <Card bodyClassName="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" disabled={!monday} onClick={() => monday && setWeekStart(addDays(monday, -7))}>
            <ChevronLeft className="h-4 w-4" /> Tuần trước
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setWeekStart(null)}>
            Tuần này
          </Button>
          <Button variant="secondary" size="sm" disabled={!monday} onClick={() => monday && setWeekStart(addDays(monday, 7))}>
            Tuần sau <ChevronRight className="h-4 w-4" />
          </Button>
          <Input
            type="date"
            className="w-auto"
            value={monday ?? ''}
            onChange={(e) => e.target.value && setWeekStart(e.target.value)}
          />
          {monday && (
            <span className="text-sm text-slate-600">
              Tuần {fmtDate(monday)} – {fmtDate(addDays(monday, 6))}
            </span>
          )}
        </div>
      </Card>

      <div className="mt-4">
        <AsyncBoundary loading={loading && !data} error={error}>
          {data && (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="sticky left-0 z-10 min-w-48 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Bác sĩ
                    </th>
                    {data.days.map((d) => (
                      <th
                        key={d}
                        className={cn(
                          'min-w-32 px-2 py-2 text-center text-xs font-semibold text-slate-600',
                          d === today && 'bg-teal-50 text-teal-700',
                        )}
                      >
                        <div className="uppercase tracking-wide">{weekdayOf(d)}</div>
                        <div className="font-normal text-slate-500">{fmtDate(d).slice(0, 5)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.doctors.map((doc) => {
                    const overPartTime = doc.is_part_time && doc.days_in_week > PART_TIME_DAYS;
                    return (
                      <tr key={doc.id} className={cn(!doc.is_active && 'opacity-60')}>
                        <td className="sticky left-0 z-10 bg-white px-3 py-2 align-top">
                          <div className="font-medium text-slate-900">{doc.full_name}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                            {doc.staff_code}
                            {doc.is_part_time && <Badge color="orange">Bán thời gian</Badge>}
                            {!doc.is_active && <Badge>Đã khóa</Badge>}
                          </div>
                          <div className={cn('mt-1 text-xs', overPartTime ? 'font-medium text-red-600' : 'text-slate-500')}>
                            {doc.days_in_week} ngày · {doc.shifts_in_week} ca
                            {doc.is_part_time && ` / tối đa ${PART_TIME_DAYS} ngày`}
                          </div>
                        </td>
                        {data.days.map((d) => (
                          <td key={d} className={cn('px-1.5 py-1.5 align-top', d === today && 'bg-teal-50/40')}>
                            <div className="flex flex-col gap-1">
                              {SHIFTS.map((sh) => (
                                <ShiftChip
                                  key={sh}
                                  shift={sh}
                                  row={shiftMap.get(`${doc.id}|${d}|${sh}`)}
                                  disabled={busy || (!doc.is_active && !shiftMap.has(`${doc.id}|${d}|${sh}`))}
                                  onClick={() => toggle(doc, d, sh)}
                                />
                              ))}
                            </div>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </AsyncBoundary>
      </div>

      <div className="mt-4">
        <Alert kind="info" title="Cách dùng">
          Bấm vào ô trống để thêm ca, bấm vào ca đã có để xóa. Giờ mặc định: ca sáng 08:00–14:00, ca chiều 14:00–20:00
          (Chủ nhật 14:00–17:00). Không xóa được ca đang có lịch hẹn — hãy đổi hoặc hủy lịch trước.
        </Alert>
      </div>
    </>
  );
}

function ShiftChip({
  shift,
  row,
  disabled,
  onClick,
}: {
  shift: ShiftCode;
  row?: ShiftRow;
  disabled?: boolean;
  onClick: () => void;
}) {
  const name = shift === 'MORNING' ? 'Sáng' : 'Chiều';
  if (!row) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="flex items-center justify-center gap-1 rounded border border-dashed border-slate-300 px-1.5 py-1 text-xs text-slate-400 hover:border-teal-400 hover:text-teal-600 disabled:cursor-not-allowed disabled:hover:border-slate-300 disabled:hover:text-slate-400"
      >
        <Plus className="h-3 w-3" /> {name}
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={row.note ?? 'Bấm để xóa ca'}
      className={cn(
        'rounded border px-1.5 py-1 text-left text-xs transition-colors disabled:cursor-not-allowed',
        shift === 'MORNING'
          ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
          : 'border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100',
      )}
    >
      <div className="font-medium">
        {name} {row.start_time}–{row.end_time}
      </div>
      <div className={cn(row.appointment_count > 0 ? 'text-teal-700' : 'text-slate-500')}>
        {row.appointment_count > 0 ? `${row.appointment_count} lịch hẹn` : 'Chưa có lịch'}
      </div>
    </button>
  );
}
