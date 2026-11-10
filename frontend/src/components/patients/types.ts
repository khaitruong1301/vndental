import type { BadgeColor } from '@/components/ui';
import type { PatientSummary } from '@/lib/types';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type PatientStatus = 'ACTIVE' | 'ARCHIVED';

export interface Guardian {
  id: number;
  full_name: string;
  relationship: string;
  phone: string;
  is_primary: boolean;
  note: string | null;
}

export interface GuardianInput {
  full_name: string;
  relationship: string;
  phone: string;
  is_primary: boolean;
  note: string;
}

export interface PatientListRow extends PatientSummary {
  is_legacy: boolean;
  legacy_record_no: string | null;
  last_visit_at: string | null;
  created_at: string;
}

export interface PatientListResponse {
  rows: PatientListRow[];
  total: number;
  page: number;
  page_size: number;
}

export interface PatientDetail extends PatientSummary {
  email: string | null;
  address: string | null;
  medical_history: string | null;
  note: string | null;
  is_legacy: boolean;
  legacy_record_no: string | null;
  last_visit_at: string | null;
  archived_at: string | null;
  age: number | null;
  created_at: string;
  updated_at: string;
  created_by_name: string | null;
  updated_by_name: string | null;
  guardians: Guardian[];
  summary: {
    total_debt: number;
    active_plans: number;
    last_visit_at: string | null;
    upcoming_appointment: {
      appointment_id: number;
      start_at: string;
      doctor_name: string;
      chair_name: string;
      service_name: string | null;
    } | null;
  };
}

export interface DuplicateCandidate {
  id: number;
  patient_code: string;
  full_name: string;
  date_of_birth: string | null;
  gender: Gender | null;
  phone: string | null;
  status: PatientStatus;
  match_reason: string;
}

export interface PatientAppointment {
  booking_group_id: string;
  appointment_id: number;
  start_at: string;
  end_at: string;
  slots: number;
  status: string;
  source: string;
  doctor_name: string;
  chair_name: string;
  service_name: string | null;
  note: string | null;
  checked_in_at: string | null;
  cancel_reason: string | null;
  cancel_note: string | null;
  cancelled_at: string | null;
}

export interface PatientTreatment {
  id: number;
  record_code: string;
  visit_at: string;
  status: string;
  chief_complaint: string | null;
  diagnosis: string | null;
  note: string | null;
  primary_doctor_name: string;
  chair_name: string | null;
  treatment_plan_id: number | null;
  plan_code: string | null;
  plan_name: string | null;
  plan_session_no: number | null;
  invoice_id: number | null;
  invoice_code: string | null;
  invoice_status: string | null;
  invoice_total: number | null;
  items: {
    id: number;
    line_no: number;
    service_name: string;
    tooth_code: string;
    performing_doctor_name: string;
    quantity: number;
    is_plan_package: boolean;
    note: string | null;
  }[];
  prescriptions: {
    id: number;
    medicine_name: string;
    dosage: string;
    quantity: number;
    unit: string | null;
    is_external: boolean;
  }[];
}

export interface PatientPlan {
  id: number;
  plan_code: string;
  name: string;
  plan_type: string;
  status: string;
  total_price: number;
  expected_sessions: number;
  started_on: string;
  ended_on: string | null;
  doctor_name: string;
  completed_sessions: number;
  paid_amount: number;
}

export interface PatientInvoice {
  id: number;
  invoice_code: string;
  invoice_type: string;
  issued_at: string;
  status: string;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  void_reason: string | null;
  record_code: string | null;
  plan_code: string | null;
  issued_by_name: string;
  payments: {
    id: number;
    receipt_code: string;
    amount: number;
    method: string;
    paid_at: string;
    received_by_name: string;
  }[];
}

export interface PatientDocument {
  id: number;
  document_type: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  description: string | null;
  uploaded_at: string;
  uploaded_by_name: string | null;
}

export const DOCUMENT_TYPE: Record<string, { label: string; color: BadgeColor }> = {
  LEGACY_SCAN: { label: 'Scan hồ sơ giấy', color: 'orange' },
  XRAY: { label: 'X-quang', color: 'blue' },
  PHOTO: { label: 'Ảnh chụp', color: 'teal' },
  OTHER: { label: 'Khác', color: 'gray' },
};

export const RELATIONSHIPS = ['Mẹ', 'Bố', 'Ông', 'Bà', 'Anh', 'Chị', 'Cô', 'Dì', 'Chú', 'Bác', 'Người giám hộ khác'];
