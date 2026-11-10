// Kiểu dữ liệu module Lịch hẹn (API /api/appointments)

/** Một nhóm lịch hẹn = các khung 30' liên tiếp cùng booking_group_id */
export interface AppointmentGroup {
  booking_group_id: string;
  appointment_id: number;
  start_at: string;
  end_at: string;
  slots: number;
  date: string;
  start_time: string;
  end_time: string;
  status: 'BOOKED' | 'ARRIVED' | 'IN_TREATMENT' | 'COMPLETED' | 'CANCELLED';
  source: 'RECEPTION' | 'DOCTOR_FOLLOW_UP' | 'WALK_IN';
  note: string | null;
  checked_in_at: string | null;
  patient_id: number;
  patient_code: string;
  patient_name: string;
  date_of_birth: string | null;
  patient_phone: string | null;
  doctor_id: number;
  doctor_name: string;
  chair_id: number;
  chair_name: string;
  service_id: number | null;
  service_name: string | null;
  cancel_reason_id: number | null;
  cancel_reason_name: string | null;
  is_no_show: boolean | null;
  cancel_note: string | null;
  cancelled_at: string | null;
  cancelled_by_name: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface DoctorShift {
  id: number;
  doctor_id: number;
  doctor_name: string;
  shift: 'MORNING' | 'AFTERNOON';
  start_time: string;
  end_time: string;
}

export interface DaySchedule {
  date: string;
  groups: AppointmentGroup[];
  shifts: DoctorShift[];
  chairs: { id: number; code: string; name: string }[];
}

export interface FreeSlot {
  doctor_id: number;
  doctor_name: string;
  start_time: string;
  free_chair_ids: number[];
}

export interface SlotChoice {
  doctor_id: number;
  start_time: string;
  chair_id: number;
}

export interface ReminderEntry {
  id: number;
  channel: 'CALL' | 'SMS' | 'ZALO';
  result: string;
  recipient_phone: string | null;
  message_content: string | null;
  provider_message_id: string | null;
  note: string | null;
  performed_by_name: string | null;
  performed_at: string;
}

export interface ReminderGroup extends AppointmentGroup {
  guardian_name: string | null;
  guardian_relationship: string | null;
  guardian_phone: string | null;
  reminders: ReminderEntry[];
}

/** Các khung 30' trong ngày làm việc 08:00–19:30 */
export const DAY_SLOTS: string[] = Array.from({ length: 24 }, (_, i) => {
  const minutes = 8 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${minutes % 60 === 0 ? '00' : '30'}`;
});

export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
