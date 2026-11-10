// Kiểu dữ liệu module Thanh toán (API /billing)

export type InvoiceStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'VOIDED';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER';
export type Shift = 'MORNING' | 'AFTERNOON';

export interface PendingRecord {
  id: number;
  record_code: string;
  visit_at: string;
  patient_id: number;
  patient_code: string;
  patient_name: string;
  phone: string | null;
  doctor_name: string;
  treatment_plan_id: number | null;
  plan_code: string | null;
  plan_session_no: number | null;
  services_summary: string | null;
  medicine_count: number;
  service_missing_price: boolean | null;
  medicine_missing_price: boolean | null;
  estimated_total: number;
}

export interface InvoiceListRow {
  id: number;
  invoice_code: string;
  invoice_type: 'VISIT' | 'TREATMENT_PLAN';
  status: InvoiceStatus;
  issued_at: string;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  patient_id: number;
  patient_code: string;
  patient_name: string;
  phone: string | null;
  issued_by_name: string;
  record_code: string | null;
  plan_code: string | null;
}

export interface InvoiceList {
  rows: InvoiceListRow[];
  page: number;
  page_size: number;
  total: number;
  sum_total: number;
  sum_balance: number;
}

export interface InvoiceLine {
  id: number;
  line_no: number;
  line_type: 'SERVICE' | 'MEDICINE' | 'TREATMENT_PLAN';
  description: string;
  tooth_code: string | null;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  line_total: number;
  performing_doctor_name: string | null;
}

export interface InvoicePayment {
  id: number;
  receipt_code: string;
  amount: number;
  method: PaymentMethod;
  transaction_ref: string | null;
  paid_at: string;
  work_date: string;
  shift: Shift;
  note: string | null;
  received_by_name: string;
  is_closed: boolean;
  installment_id: number | null;
  installment_no: number | null;
}

export interface InvoiceAdjustment {
  id: number;
  adjustment_type: 'VOID' | 'ADJUST';
  reason: string;
  old_total: number;
  new_total: number;
  /** ADJUST: giảm giá trước/sau khi điều chỉnh */
  detail: { old_discount?: number | string; new_discount?: number | string } | null;
  performed_at: string;
  performed_by_name: string;
}

export interface Installment {
  id: number;
  installment_no: number;
  due_date: string | null;
  amount: number;
  note: string | null;
  paid_amount: number;
}

export interface InvoiceDetail {
  id: number;
  invoice_code: string;
  invoice_type: 'VISIT' | 'TREATMENT_PLAN';
  status: InvoiceStatus;
  patient_id: number;
  patient_code: string;
  patient_name: string;
  patient_phone: string | null;
  patient_dob: string | null;
  patient_address: string | null;
  treatment_record_id: number | null;
  record_code: string | null;
  visit_at: string | null;
  record_doctor_name: string | null;
  treatment_plan_id: number | null;
  plan_code: string | null;
  plan_name: string | null;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  discount_reason: string | null;
  discount_by_name: string | null;
  issued_at: string;
  issued_by_name: string;
  voided_at: string | null;
  voided_by_name: string | null;
  void_reason: string | null;
  note: string | null;
  lines: InvoiceLine[];
  payments: InvoicePayment[];
  adjustments: InvoiceAdjustment[];
  installments: Installment[];
}

export interface DebtRow {
  patient_id: number;
  patient_code: string;
  full_name: string;
  phone: string | null;
  open_invoices: number;
  total_debt: number;
  oldest_invoice_at: string;
  grand_total: number;
}

export interface DebtInvoice {
  id: number;
  invoice_code: string;
  invoice_type: 'VISIT' | 'TREATMENT_PLAN';
  status: InvoiceStatus;
  issued_at: string;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  record_code: string | null;
  plan_code: string | null;
  plan_name: string | null;
}

export interface CashClosing {
  id: number;
  receptionist_id: number;
  receptionist_name: string;
  staff_code?: string;
  work_date: string;
  shift: Shift;
  expected_cash: number;
  counted_cash: number;
  difference: number;
  note: string | null;
  closed_at: string;
  payment_count?: number;
  transfer_total?: number;
}

export interface CashSummary {
  work_date: string;
  shift: Shift;
  current_date: string;
  current_shift: Shift;
  payments: {
    id: number;
    receipt_code: string;
    amount: number;
    method: PaymentMethod;
    transaction_ref: string | null;
    paid_at: string;
    note: string | null;
    is_closed: boolean;
    invoice_id: number;
    invoice_code: string;
    patient_code: string;
    patient_name: string;
  }[];
  cash_total: number;
  transfer_total: number;
  closing: CashClosing | null;
}
