import { z } from 'zod';
import { badRequest } from './errors.js';

export const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')
  .refine((v) => {
    // Lịch thật: loại 2026-02-30, 2026-13-01 (so chuỗi ISO, không phụ thuộc múi giờ)
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'Ngày không tồn tại');
export const timeStr = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Giờ phải có dạng HH:mm');
export const money = z.coerce.number().min(0, 'Số tiền không được âm');
export const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullish();
export const shift = z.enum(['MORNING', 'AFTERNOON']);

/** Lấy id số nguyên dương từ req.params */
export function idParam(value: string | string[] | undefined): number {
  const id = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isSafeInteger(id) || id <= 0) throw badRequest('Mã không hợp lệ');
  return id;
}
