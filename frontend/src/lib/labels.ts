import type { BadgeColor } from '@/components/ui';

export interface Label {
  label: string;
  color: BadgeColor;
}

type LabelMap = Record<string, Label>;

export const APPOINTMENT_STATUS: LabelMap = {
  BOOKED: { label: 'Đã đặt', color: 'blue' },
  ARRIVED: { label: 'Đã đến', color: 'yellow' },
  IN_TREATMENT: { label: 'Đang khám', color: 'purple' },
  COMPLETED: { label: 'Hoàn tất', color: 'green' },
  CANCELLED: { label: 'Đã hủy', color: 'gray' },
};

export const APPOINTMENT_SOURCE: LabelMap = {
  RECEPTION: { label: 'Lễ tân đặt', color: 'gray' },
  DOCTOR_FOLLOW_UP: { label: 'Hẹn tái khám', color: 'teal' },
  WALK_IN: { label: 'Vãng lai', color: 'orange' },
};

export const RECORD_STATUS: LabelMap = {
  DRAFT: { label: 'Nháp', color: 'gray' },
  PENDING_PAYMENT: { label: 'Chờ thanh toán', color: 'yellow' },
  INVOICED: { label: 'Đã lập hóa đơn', color: 'green' },
  CANCELLED: { label: 'Đã hủy', color: 'red' },
};

export const INVOICE_STATUS: LabelMap = {
  UNPAID: { label: 'Chưa thu', color: 'red' },
  PARTIALLY_PAID: { label: 'Còn nợ', color: 'yellow' },
  PAID: { label: 'Đã thanh toán đủ', color: 'green' },
  VOIDED: { label: 'Đã hủy', color: 'gray' },
};

export const INVOICE_TYPE: LabelMap = {
  VISIT: { label: 'Buổi khám', color: 'blue' },
  TREATMENT_PLAN: { label: 'Liệu trình', color: 'purple' },
};

export const PLAN_STATUS: LabelMap = {
  ACTIVE: { label: 'Đang điều trị', color: 'blue' },
  COMPLETED: { label: 'Đã kết thúc', color: 'green' },
  CANCELLED: { label: 'Đã hủy', color: 'gray' },
};

export const PLAN_TYPE: LabelMap = {
  ORTHODONTIC: { label: 'Chỉnh nha', color: 'teal' },
  IMPLANT: { label: 'Implant', color: 'purple' },
  OTHER: { label: 'Khác', color: 'gray' },
};

export const PAYMENT_METHOD: LabelMap = {
  CASH: { label: 'Tiền mặt', color: 'green' },
  BANK_TRANSFER: { label: 'Chuyển khoản', color: 'blue' },
};

export const SHIFT: LabelMap = {
  MORNING: { label: 'Ca sáng', color: 'yellow' },
  AFTERNOON: { label: 'Ca chiều', color: 'orange' },
};

export const GENDER: LabelMap = {
  MALE: { label: 'Nam', color: 'blue' },
  FEMALE: { label: 'Nữ', color: 'purple' },
  OTHER: { label: 'Khác', color: 'gray' },
};

export const PATIENT_STATUS: LabelMap = {
  ACTIVE: { label: 'Đang theo dõi', color: 'green' },
  ARCHIVED: { label: 'Lưu trữ', color: 'gray' },
};

export const ITEM_TYPE: LabelMap = {
  SUPPLY: { label: 'Vật tư', color: 'teal' },
  MEDICINE: { label: 'Thuốc', color: 'purple' },
};

export const MOVEMENT_TYPE: LabelMap = {
  IMPORT: { label: 'Nhập kho', color: 'green' },
  TREATMENT_USE: { label: 'Dùng cho điều trị', color: 'blue' },
  DISPENSE: { label: 'Xuất thuốc', color: 'purple' },
  STOCK_TAKE: { label: 'Kiểm kê', color: 'yellow' },
  ADJUSTMENT: { label: 'Điều chỉnh', color: 'orange' },
};

export const REMINDER_CHANNEL: LabelMap = {
  CALL: { label: 'Gọi điện', color: 'blue' },
  SMS: { label: 'SMS', color: 'teal' },
  ZALO: { label: 'Zalo', color: 'purple' },
};

export const REMINDER_RESULT: LabelMap = {
  CONFIRMED: { label: 'Đã xác nhận', color: 'green' },
  NO_ANSWER: { label: 'Không nghe máy', color: 'yellow' },
  WRONG_NUMBER: { label: 'Sai số', color: 'red' },
  RESCHEDULE_REQUESTED: { label: 'Xin đổi lịch', color: 'orange' },
  CANCEL_REQUESTED: { label: 'Xin hủy', color: 'red' },
  SENT: { label: 'Đã gửi tin', color: 'blue' },
  DELIVERED: { label: 'Đã nhận tin', color: 'green' },
  FAILED: { label: 'Gửi lỗi', color: 'red' },
};

export const ROLE: LabelMap = {
  RECEPTIONIST: { label: 'Lễ tân', color: 'blue' },
  DOCTOR: { label: 'Bác sĩ', color: 'teal' },
  MANAGER: { label: 'Quản lý', color: 'purple' },
};

export const TOOTH_SCOPE: LabelMap = {
  TOOTH: { label: 'Theo răng', color: 'blue' },
  JAW: { label: 'Theo hàm', color: 'teal' },
  ANY: { label: 'Răng hoặc hàm', color: 'gray' },
};

/** Số răng FDI hoặc phạm vi hàm */
export function toothLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return { FULL: 'Toàn hàm', UPPER: 'Hàm trên', LOWER: 'Hàm dưới' }[code] ?? `Răng ${code}`;
}

export function labelOf(map: LabelMap, key: string | null | undefined): Label {
  return (key && map[key]) || { label: key ?? '—', color: 'gray' };
}
