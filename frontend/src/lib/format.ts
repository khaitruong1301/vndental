// Mọi ngày giờ hiển thị theo giờ phòng khám, không theo máy người dùng
export const CLINIC_TZ = 'Asia/Ho_Chi_Minh';

const moneyFormat = new Intl.NumberFormat('vi-VN');
const numberFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat('vi-VN', {
  timeZone: CLINIC_TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: CLINIC_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const isoDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLINIC_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

type DateInput = string | Date | null | undefined;

function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  // Cột kiểu date trả về 'YYYY-MM-DD' → hiểu là ngày tại phòng khám
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00+07:00`);
  return new Date(value);
}

export function fmtMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  // Khoảng trắng không ngắt dòng: không tách "đ" khỏi số
  return `${moneyFormat.format(Math.round(Number(value)))} đ`;
}

export function fmtNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return numberFormat.format(Number(value));
}

export function fmtDate(value: DateInput): string {
  return value ? dateFormat.format(toDate(value)) : '—';
}

export function fmtTime(value: DateInput): string {
  return value ? timeFormat.format(toDate(value)) : '—';
}

export function fmtDateTime(value: DateInput): string {
  return value ? `${fmtTime(value)} ${fmtDate(value)}` : '—';
}

/** 'YYYY-MM-DD' theo giờ phòng khám */
export function dateStrOf(value: Date | string): string {
  return isoDateFormat.format(toDate(value));
}

/** 'HH:mm' theo giờ phòng khám */
export function timeStrOf(value: Date | string): string {
  return timeFormat.format(toDate(value));
}

export function todayStr(): string {
  return dateStrOf(new Date());
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function ageOf(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const [y, m, d] = dob.split('-').map(Number);
  const [ty, tm, td] = todayStr().split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

const WEEKDAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

export function weekdayOf(dateStr: string): string {
  return WEEKDAYS[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];
}

/** 'YYYY-MM' của tháng hiện tại */
export function currentMonthStr(): string {
  return todayStr().slice(0, 7);
}
