'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Field, Input, Modal, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { useLookups } from '@/lib/auth';
import { fmtDate, todayStr } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import { SlotPicker } from './SlotPicker';
import type { AppointmentGroup, SlotChoice } from './types';

/** LH-03: đổi lịch (giữ nguyên số khung), hệ thống kiểm tra xung đột (LH-07) */
export function RescheduleModal({
  group,
  onClose,
  onDone,
}: {
  group: AppointmentGroup | null;
  onClose: () => void;
  onDone: (group: AppointmentGroup) => void;
}) {
  const { doctors } = useLookups();
  const [date, setDate] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [choice, setChoice] = useState<SlotChoice | null>(null);
  const [slotRefresh, setSlotRefresh] = useState(0);
  const { run, busy } = useAction();

  useEffect(() => {
    if (!group) return;
    setDate(group.date);
    setDoctorId(String(group.doctor_id));
    setChoice(null);
  }, [group]);

  async function submit() {
    if (!group || !choice) return;
    const result = await run(
      () =>
        api.put<AppointmentGroup>(`/appointments/groups/${group.booking_group_id}/reschedule`, {
          doctor_id: choice.doctor_id,
          chair_id: choice.chair_id,
          date,
          start_time: choice.start_time,
        }),
      'Đã đổi lịch hẹn',
    );
    if (result) onDone(result);
    else {
      setChoice(null);
      setSlotRefresh((k) => k + 1);
    }
  }

  return (
    <Modal
      open={!!group}
      onClose={onClose}
      title="Đổi lịch hẹn"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
          <Button loading={busy} disabled={!choice} onClick={submit}>
            Lưu lịch mới
          </Button>
        </>
      }
    >
      {group && (
        <div className="space-y-4">
          <Alert kind="info">
            Lịch hiện tại: <b>{group.patient_name}</b> · {group.start_time}–{group.end_time} {fmtDate(group.date)} · BS{' '}
            {group.doctor_name} · {group.chair_name}
            {group.slots > 1 && ` · ${group.slots} khung`}
          </Alert>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Ngày mới" required>
              <Input
                type="date"
                min={todayStr()}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setChoice(null);
                }}
              />
            </Field>
            <Field label="Bác sĩ">
              <Select
                value={doctorId}
                onChange={(e) => {
                  setDoctorId(e.target.value);
                  setChoice(null);
                }}
              >
                <option value="">Bất kỳ bác sĩ đang trực</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {date && (
            <SlotPicker
              date={date}
              doctorId={doctorId ? Number(doctorId) : null}
              slots={group.slots}
              excludeGroup={group.booking_group_id}
              value={choice}
              onChange={setChoice}
              preferredChairId={group.chair_id}
              refreshKey={slotRefresh}
            />
          )}
        </div>
      )}
    </Modal>
  );
}
