'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CalendarClock, FolderOpen, UserRoundCheck, XCircle } from 'lucide-react';
import { Button, DescriptionList, Modal, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ageOf, fmtDate, fmtDateTime, todayStr, weekdayOf } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import { APPOINTMENT_SOURCE, APPOINTMENT_STATUS, labelOf } from '@/lib/labels';
import { CancelModal } from './CancelModal';
import { RescheduleModal } from './RescheduleModal';
import type { AppointmentGroup } from './types';

/** Chi tiết một lịch hẹn + thao tác theo quyền: tiếp đón (LH-08), đổi (LH-03), hủy (LH-04), xem hồ sơ (BN-05) */
export function AppointmentDetailModal({
  group,
  onClose,
  onChanged,
}: {
  group: AppointmentGroup | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can } = useAuth();
  const { run, busy } = useAction();
  const [rescheduling, setRescheduling] = useState<AppointmentGroup | null>(null);
  const [cancelling, setCancelling] = useState<AppointmentGroup | null>(null);

  if (!group) return null;
  const isToday = group.date === todayStr();
  const booked = group.status === 'BOOKED';

  async function checkIn() {
    if (!group) return;
    const ok = await run(
      () => api.post(`/appointments/groups/${group.booking_group_id}/check-in`),
      `Đã tiếp đón ${group.patient_name}`,
    );
    if (ok) {
      onChanged();
      onClose();
    }
  }

  const done = () => {
    setRescheduling(null);
    setCancelling(null);
    onChanged();
    onClose();
  };

  return (
    <>
      <Modal
        open={!rescheduling && !cancelling}
        onClose={onClose}
        title="Chi tiết lịch hẹn"
        footer={
          <>
            {can('BN-05') && (
              <Link href={`/patients/${group.patient_id}`}>
                <Button variant="secondary">
                  <FolderOpen className="h-4 w-4" /> Xem hồ sơ
                </Button>
              </Link>
            )}
            {booked && can('LH-04') && (
              <Button variant="secondary" onClick={() => setCancelling(group)}>
                <XCircle className="h-4 w-4" /> Hủy lịch
              </Button>
            )}
            {booked && can('LH-03') && (
              <Button variant="secondary" onClick={() => setRescheduling(group)}>
                <CalendarClock className="h-4 w-4" /> Đổi lịch
              </Button>
            )}
            {booked && isToday && can('LH-08') && (
              <Button loading={busy} onClick={checkIn}>
                <UserRoundCheck className="h-4 w-4" /> Tiếp đón
              </Button>
            )}
          </>
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-lg font-semibold text-slate-900">{group.patient_name}</span>
          <span className="text-sm text-slate-500">{group.patient_code}</span>
          <StatusBadge label={labelOf(APPOINTMENT_STATUS, group.status)} />
          <StatusBadge label={labelOf(APPOINTMENT_SOURCE, group.source)} />
        </div>
        <DescriptionList
          items={[
            { label: 'Thời gian', value: `${group.start_time}–${group.end_time}, ${weekdayOf(group.date)} ${fmtDate(group.date)}` },
            { label: 'Số khung', value: `${group.slots} × 30 phút` },
            { label: 'Bác sĩ', value: group.doctor_name },
            { label: 'Ghế', value: group.chair_name },
            { label: 'Dịch vụ dự kiến', value: group.service_name ?? '—' },
            {
              label: 'Ngày sinh / SĐT',
              value: `${fmtDate(group.date_of_birth)}${group.date_of_birth ? ` (${ageOf(group.date_of_birth)} tuổi)` : ''} · ${group.patient_phone ?? '—'}`,
            },
            { label: 'Người đặt', value: `${group.created_by_name ?? '—'} · ${fmtDateTime(group.created_at)}` },
            { label: 'Giờ đến', value: group.checked_in_at ? fmtDateTime(group.checked_in_at) : '—' },
            ...(group.note ? [{ label: 'Ghi chú', value: group.note }] : []),
            ...(group.status === 'CANCELLED'
              ? [
                  {
                    label: 'Lý do hủy',
                    value: `${group.cancel_reason_name ?? '—'}${group.cancel_note ? ` — ${group.cancel_note}` : ''}`,
                  },
                  { label: 'Người hủy', value: `${group.cancelled_by_name ?? '—'} · ${fmtDateTime(group.cancelled_at)}` },
                ]
              : []),
          ]}
        />
      </Modal>
      <RescheduleModal group={rescheduling} onClose={() => setRescheduling(null)} onDone={done} />
      <CancelModal group={cancelling} onClose={() => setCancelling(null)} onDone={done} />
    </>
  );
}
