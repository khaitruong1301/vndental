'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Field, Modal, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { useLookups } from '@/lib/auth';
import { fmtDate } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import type { AppointmentGroup } from './types';

/** LH-04: hủy lịch — bắt buộc chọn lý do; "Không đến" là lý do đặc biệt để thống kê BC-04 */
export function CancelModal({
  group,
  onClose,
  onDone,
  noShow,
}: {
  group: AppointmentGroup | null;
  onClose: () => void;
  onDone: (group: AppointmentGroup) => void;
  /** Mở sẵn với lý do "Không đến" */
  noShow?: boolean;
}) {
  const { cancel_reasons } = useLookups();
  const [reasonId, setReasonId] = useState('');
  const [note, setNote] = useState('');
  const { run, busy } = useAction();

  useEffect(() => {
    if (!group) return;
    setReasonId(noShow ? String(cancel_reasons.find((r) => r.is_no_show)?.id ?? '') : '');
    setNote('');
  }, [group, noShow, cancel_reasons]);

  async function submit() {
    if (!group) return;
    const result = await run(
      () =>
        api.post<AppointmentGroup>(`/appointments/groups/${group.booking_group_id}/cancel`, {
          cancel_reason_id: Number(reasonId),
          cancel_note: note,
        }),
      'Đã hủy lịch hẹn',
    );
    if (result) onDone(result);
  }

  return (
    <Modal
      open={!!group}
      onClose={onClose}
      title="Hủy lịch hẹn"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
          <Button variant="danger" loading={busy} disabled={!reasonId} onClick={submit}>
            Xác nhận hủy
          </Button>
        </>
      }
    >
      {group && (
        <div className="space-y-3">
          <Alert kind="warning">
            {group.patient_name} · {group.start_time}–{group.end_time} {fmtDate(group.date)} · BS {group.doctor_name}
          </Alert>
          <Field label="Lý do hủy" required>
            <Select value={reasonId} onChange={(e) => setReasonId(e.target.value)}>
              <option value="">— Chọn lý do —</option>
              {cancel_reasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ghi chú thêm">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: khách gọi báo đi công tác" />
          </Field>
          <p className="text-xs text-slate-500">Lịch đã hủy không bị xóa; hệ thống ghi lại người hủy và thời điểm hủy.</p>
        </div>
      )}
    </Modal>
  );
}
