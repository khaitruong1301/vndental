'use client';

import { Badge, EmptyState } from '@/components/ui';
import { useLookups } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';
import { labelOf, RECORD_STATUS, toothLabel } from '@/lib/labels';
import type { AuditEntry } from './types';

const TABLE_LABEL: Record<string, string> = {
  treatment_records: 'Phiếu điều trị',
  treatment_record_items: 'Dòng dịch vụ',
  prescription_items: 'Đơn thuốc',
  treatment_record_materials: 'Vật tư',
};

const ACTION: Record<string, { label: string; color: 'green' | 'blue' | 'red' }> = {
  INSERT: { label: 'Thêm', color: 'green' },
  UPDATE: { label: 'Sửa', color: 'blue' },
  DELETE: { label: 'Xóa', color: 'red' },
};

const FIELD_LABEL: Record<string, string> = {
  status: 'Trạng thái',
  chief_complaint: 'Lý do khám',
  diagnosis: 'Chẩn đoán',
  note: 'Ghi chú',
  treatment_plan_id: 'Liệu trình',
  plan_session_no: 'Buổi thứ',
  service_id: 'Dịch vụ',
  tooth_code: 'Số răng',
  performing_doctor_id: 'Bác sĩ thực hiện',
  quantity: 'Số lượng',
  is_plan_package: 'Trọn gói liệu trình',
  item_id: 'Thuốc/vật tư',
  medicine_name: 'Tên thuốc',
  dosage: 'Liều dùng',
  unit: 'Đơn vị',
  is_external: 'Mua ngoài',
  norm_quantity: 'Định mức',
  actual_quantity: 'Thực dùng',
  primary_doctor_id: 'Bác sĩ chính',
};

// Cột kỹ thuật không hiển thị
const HIDDEN = new Set(['id', 'treatment_record_id', 'created_at', 'updated_at', 'created_by', 'updated_by', 'line_no', 'record_code', 'patient_id', 'appointment_id', 'visit_at', 'chair_id']);

/** DT-09: ai sửa, lúc nào, lý do, nội dung trước → sau */
export function HistoryTimeline({ entries }: { entries: AuditEntry[] }) {
  const lookups = useLookups();

  function show(field: string, value: unknown, planLabel?: string | null): string {
    if (value === null || value === undefined || value === '') return '—';
    switch (field) {
      case 'treatment_plan_id':
        return planLabel ?? `#${value}`;
      case 'service_id':
        return lookups.services.find((s) => s.id === value)?.name ?? `#${value}`;
      case 'performing_doctor_id':
      case 'primary_doctor_id':
        return lookups.staff.find((s) => s.id === value)?.full_name ?? `#${value}`;
      case 'item_id':
        return lookups.items.find((i) => i.id === value)?.name ?? `#${value}`;
      case 'tooth_code':
        return toothLabel(String(value));
      case 'status':
        return labelOf(RECORD_STATUS, String(value)).label;
      case 'is_plan_package':
      case 'is_external':
        return value ? 'Có' : 'Không';
      default:
        return String(value);
    }
  }

  function changes(e: AuditEntry): { field: string; before?: unknown; after?: unknown }[] {
    const oldD = e.old_data ?? {};
    const newD = e.new_data ?? {};
    const keys = Object.keys(e.action === 'DELETE' ? oldD : newD).filter((k) => !HIDDEN.has(k) && FIELD_LABEL[k]);
    if (e.action === 'UPDATE') {
      return keys.filter((k) => JSON.stringify(oldD[k]) !== JSON.stringify(newD[k])).map((k) => ({ field: k, before: oldD[k], after: newD[k] }));
    }
    const src = e.action === 'DELETE' ? oldD : newD;
    return keys.filter((k) => src[k] !== null && src[k] !== '' && src[k] !== false).map((k) => ({ field: k, after: src[k] }));
  }

  const visible = entries.filter((e) => changes(e).length > 0);
  if (!visible.length) return <EmptyState title="Chưa có lịch sử chỉnh sửa" />;

  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5">
      {visible.map((e) => {
        const action = ACTION[e.action];
        return (
          <li key={e.id} className="relative">
            <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-teal-500 ring-4 ring-white" />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge color={action.color}>{action.label}</Badge>
              <span className="font-medium text-slate-800">{TABLE_LABEL[e.table_name] ?? e.table_name}</span>
              <span className="text-slate-500">
                · {e.changed_by_name ?? 'Hệ thống'} · {fmtDateTime(e.changed_at)}
              </span>
            </div>
            {e.reason && <div className="mt-1 text-sm text-amber-700">Lý do: {e.reason}</div>}
            <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
              {changes(e).map((c) => (
                <li key={c.field}>
                  <span className="text-slate-500">{FIELD_LABEL[c.field]}:</span>{' '}
                  {e.action === 'UPDATE' ? (
                    <>
                      <span className="text-red-600 line-through">{show(c.field, c.before, e.old_plan_label)}</span> →{' '}
                      <span className="font-medium text-emerald-700">{show(c.field, c.after, e.new_plan_label)}</span>
                    </>
                  ) : (
                    <span className={e.action === 'DELETE' ? 'text-red-600 line-through' : ''}>{show(c.field, c.after, e.action === 'DELETE' ? e.old_plan_label : e.new_plan_label)}</span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
