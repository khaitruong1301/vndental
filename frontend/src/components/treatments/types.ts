// Kiểu dữ liệu của module Khám & điều trị (API /treatments, /plans)

export type RecordStatus = 'DRAFT' | 'PENDING_PAYMENT' | 'INVOICED' | 'CANCELLED';
export type ToothScope = 'TOOTH' | 'JAW' | 'ANY';

export interface PlanOption {
  id: number;
  plan_code: string;
  name: string;
  plan_type: string;
  status: string;
  service_id: number | null;
  service_name: string | null;
  expected_sessions: number;
  completed_sessions: number;
  last_session_no: number | null;
}

export interface RecordDetail {
  record: {
    id: number;
    record_code: string;
    patient_id: number;
    appointment_id: number | null;
    primary_doctor_id: number;
    primary_doctor_name: string;
    chair_id: number | null;
    chair_name: string | null;
    visit_at: string;
    status: RecordStatus;
    chief_complaint: string | null;
    diagnosis: string | null;
    note: string | null;
    treatment_plan_id: number | null;
    plan_session_no: number | null;
    created_by_name: string | null;
    updated_by_name: string | null;
    updated_at: string;
    appointment_service_id: number | null;
  };
  patient: {
    id: number;
    patient_code: string;
    full_name: string;
    date_of_birth: string | null;
    gender: string | null;
    phone: string | null;
    medical_history: string | null;
    note: string | null;
    status: string;
  };
  items: {
    id: number;
    line_no: number;
    service_id: number;
    service_name: string;
    tooth_scope: ToothScope;
    tooth_code: string;
    performing_doctor_id: number;
    performing_doctor_name: string;
    quantity: number;
    is_plan_package: boolean;
    note: string | null;
  }[];
  prescriptions: {
    id: number;
    item_id: number | null;
    medicine_name: string;
    dosage: string;
    quantity: number;
    unit: string | null;
    is_external: boolean;
    note: string | null;
    current_stock: number | null;
  }[];
  materials: {
    id: number;
    item_id: number;
    item_code: string;
    item_name: string;
    unit: string;
    item_type: string;
    norm_quantity: number;
    actual_quantity: number;
    note: string | null;
    current_stock: number;
    min_stock: number;
  }[];
  plan: PlanOption | null;
  active_plans: PlanOption[];
  invoice: { id: number; invoice_code: string; status: string; total_amount: number; balance_due: number } | null;
}

export interface AuditEntry {
  id: number;
  table_name: string;
  record_id: number;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  reason: string | null;
  changed_at: string;
  changed_by: number | null;
  changed_by_name: string | null;
  old_plan_label: string | null;
  new_plan_label: string | null;
}

export interface InstallmentDraft {
  key: string;
  id?: number;
  installment_no: number;
  due_date: string;
  amount: string;
  note: string;
  paid_amount?: number;
}

let seq = 0;
/** Khóa React cho dòng nhập liệu chưa lưu */
export function newKey(): string {
  seq += 1;
  return `k${Date.now()}_${seq}`;
}
