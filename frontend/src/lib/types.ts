// Kiểu dữ liệu dùng chung giữa các module. Dữ liệu từ API dùng snake_case như DB.

export type Role = 'RECEPTIONIST' | 'DOCTOR' | 'MANAGER';

export interface AuthUser {
  id: number;
  staffCode: string;
  name: string;
  role: Role;
  permissions: string[];
  /** Tài khoản mới / vừa đặt lại mật khẩu: phải đổi mật khẩu trước khi dùng */
  mustChangePassword: boolean;
}

export interface LookupDoctor {
  id: number;
  staff_code: string;
  full_name: string;
  is_part_time: boolean;
}

export interface LookupStaff {
  id: number;
  staff_code: string;
  full_name: string;
  role: Role;
}

export interface LookupChair {
  id: number;
  code: string;
  name: string;
}

export interface LookupService {
  id: number;
  code: string;
  name: string;
  category: string | null;
  unit: string;
  tooth_scope: 'TOOTH' | 'JAW' | 'ANY';
  default_slots: number;
  current_price: number | null;
}

export interface LookupItem {
  id: number;
  code: string;
  name: string;
  item_type: 'SUPPLY' | 'MEDICINE';
  unit: string;
  current_stock: number;
  min_stock: number;
  default_dosage: string | null;
  current_price: number | null;
}

export interface LookupCancelReason {
  id: number;
  code: string;
  name: string;
  is_no_show: boolean;
}

export interface Lookups {
  doctors: LookupDoctor[];
  staff: LookupStaff[];
  chairs: LookupChair[];
  services: LookupService[];
  items: LookupItem[];
  cancel_reasons: LookupCancelReason[];
  roles: { id: number; code: Role; name: string }[];
}

/** Kết quả tìm bệnh nhân (GET /patients/search) */
export interface PatientSummary {
  id: number;
  patient_code: string;
  full_name: string;
  date_of_birth: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  phone: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  guardian_name: string | null;
  guardian_relationship: string | null;
  guardian_phone: string | null;
}
