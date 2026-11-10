import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, details);
export const notFound = (message = 'Không tìm thấy dữ liệu') => new HttpError(404, message);
export const forbidden = (message = 'Bạn không có quyền thực hiện chức năng này') => new HttpError(403, message);
export const conflict = (message: string) => new HttpError(409, message);

// Thông báo thân thiện cho các ràng buộc không tự RAISE thông điệp tiếng Việt
const CONSTRAINT_MESSAGES: Record<string, string> = {
  ex_appointments_chair_overlap: 'Ghế đã có lịch trong khung giờ này',
  ex_appointments_doctor_overlap: 'Bác sĩ đã có lịch trong khung giờ này',
  chk_appointments_slot: 'Khung giờ phải bắt đầu ở phút :00 hoặc :30 và dài 30 phút',
  chk_appointments_cancel: 'Hủy lịch phải chọn lý do',
  chk_tooth_code: 'Số răng không hợp lệ (FDI 11–48, 51–85 hoặc FULL/UPPER/LOWER)',
  chk_invoices_paid_not_exceed_total: 'Tổng tiền đã thu vượt tổng hóa đơn',
  chk_invoices_discount_reason: 'Phải ghi lý do giảm giá',
  chk_cash_closings_note: 'Tiền đếm lệch với hệ thống — bắt buộc ghi chú',
  ux_staff_username: 'Tên đăng nhập đã tồn tại',
  staff_staff_code_key: 'Mã nhân viên đã tồn tại',
  services_code_key: 'Mã dịch vụ đã tồn tại',
  items_code_key: 'Mã vật tư/thuốc đã tồn tại',
  chairs_code_key: 'Mã ghế đã tồn tại',
  cancel_reasons_code_key: 'Mã lý do hủy đã tồn tại',
  ux_treatment_records_plan_session: 'Buổi liệu trình này đã có phiếu điều trị',
  ux_invoices_record: 'Phiếu điều trị này đã có hóa đơn',
  ux_invoices_plan: 'Liệu trình này đã có hóa đơn',
  doctor_shifts_doctor_id_work_date_shift_key: 'Bác sĩ đã có ca này trong ngày',
  service_prices_service_id_effective_from_key: 'Dịch vụ đã có giá với ngày hiệu lực này',
  item_prices_item_id_effective_from_key: 'Thuốc/vật tư đã có giá với ngày hiệu lực này',
  cash_closings_receptionist_id_work_date_shift_key: 'Ca này đã được chốt két',
};

const PG_STATUS: Record<string, number> = {
  '23P01': 409, // exclusion_violation
  '23505': 409, // unique_violation
  '23514': 400, // check_violation
  '23503': 400, // foreign_key_violation
  '23502': 400, // not_null_violation
  '23001': 409, // restrict_violation
  '22P02': 400, // invalid_text_representation
  '22007': 400, // invalid_datetime_format
  '22008': 400, // datetime_field_overflow
  '22003': 400, // numeric_value_out_of_range
  P0002: 404, // no_data_found
  '42501': 403, // insufficient_privilege
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    // Cookie không còn hợp lệ → xóa để trang /login hiện được (tránh vòng lặp chuyển trang)
    if (err.status === 401) res.clearCookie('clinic_token', { path: '/' });
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Dữ liệu không hợp lệ',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Dữ liệu gửi lên không đúng định dạng JSON' });
    return;
  }
  const pgErr = err as { code?: string; constraint?: string; message?: string };
  const status = pgErr.code ? PG_STATUS[pgErr.code] : undefined;
  if (status) {
    const message =
      (pgErr.constraint && CONSTRAINT_MESSAGES[pgErr.constraint]) ||
      (pgErr.code!.startsWith('22') ? 'Dữ liệu không hợp lệ (ngày, số hoặc mã vượt giới hạn)' : pgErr.message);
    res.status(status).json({ error: message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Lỗi hệ thống, vui lòng thử lại' });
};
