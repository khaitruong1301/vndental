'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Alert, Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
import { ageOf, todayStr } from '@/lib/format';
import { type Gender, type GuardianInput, type PatientStatus, RELATIONSHIPS } from './types';

export interface PatientFormValues {
  full_name: string;
  date_of_birth: string;
  gender: Gender | '';
  phone: string;
  email: string;
  address: string;
  medical_history: string;
  note: string;
  legacy_record_no: string;
  last_visit_at: string;
  status: PatientStatus;
  guardians: GuardianInput[];
}

export const EMPTY_PATIENT: PatientFormValues = {
  full_name: '',
  date_of_birth: '',
  gender: '',
  phone: '',
  email: '',
  address: '',
  medical_history: '',
  note: '',
  legacy_record_no: '',
  last_visit_at: '',
  status: 'ACTIVE',
  guardians: [],
};

const emptyGuardian = (phone: string, primary: boolean): GuardianInput => ({
  full_name: '',
  relationship: 'Mẹ',
  phone,
  is_primary: primary,
  note: '',
});

/** Payload gửi API: chuỗi rỗng → null */
export function toPatientPayload(v: PatientFormValues, extra: Record<string, unknown> = {}) {
  const orNull = (s: string) => (s.trim() === '' ? null : s.trim());
  return {
    full_name: v.full_name.trim(),
    date_of_birth: orNull(v.date_of_birth),
    gender: v.gender || null,
    phone: orNull(v.phone),
    email: orNull(v.email),
    address: orNull(v.address),
    medical_history: orNull(v.medical_history),
    note: orNull(v.note),
    legacy_record_no: orNull(v.legacy_record_no),
    ...extra,
  };
}

/**
 * Form hồ sơ bệnh nhân dùng cho BN-02 (đăng ký), BN-06 (số hóa hồ sơ giấy) và BN-04 (sửa).
 * Ở chế độ tạo mới, phần người giám hộ (BN-03) tự hiện và bắt buộc khi bệnh nhân dưới 15 tuổi.
 */
export function PatientForm({
  mode,
  legacy,
  initial,
  submitting,
  onSubmit,
  onCancel,
}: {
  mode: 'create' | 'edit';
  legacy: boolean;
  initial: PatientFormValues;
  submitting: boolean;
  onSubmit: (values: PatientFormValues) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<PatientFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const age = v.date_of_birth ? ageOf(v.date_of_birth) : null;
  const under15 = age !== null && age >= 0 && age < 15;
  const showGuardians = mode === 'create' && (under15 || v.guardians.length > 0);

  const set = <K extends keyof PatientFormValues>(key: K, value: PatientFormValues[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));

  // Trẻ dưới 15 tuổi: tự thêm một dòng người giám hộ, gợi ý SĐT chính là SĐT liên hệ
  useEffect(() => {
    if (mode === 'create' && under15 && v.guardians.length === 0) {
      setV((prev) => ({ ...prev, guardians: [emptyGuardian(prev.phone, true)] }));
    }
  }, [mode, under15, v.guardians.length]);

  function setGuardian(index: number, patch: Partial<GuardianInput>) {
    setV((prev) => ({
      ...prev,
      guardians: prev.guardians.map((g, i) =>
        i === index ? { ...g, ...patch } : patch.is_primary ? { ...g, is_primary: false } : g,
      ),
    }));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!v.full_name.trim()) e.full_name = 'Nhập họ tên bệnh nhân';
    if (v.date_of_birth && v.date_of_birth > todayStr()) e.date_of_birth = 'Ngày sinh không được ở tương lai';
    if (v.phone && !/^[0-9+ .-]{6,20}$/.test(v.phone)) e.phone = 'Số điện thoại không hợp lệ';
    if (legacy && v.last_visit_at && v.last_visit_at > todayStr()) e.last_visit_at = 'Ngày khám cuối không được ở tương lai';
    if (mode === 'create') {
      if (under15 && v.guardians.length === 0) e.guardians = 'Bệnh nhân dưới 15 tuổi phải có người giám hộ';
      v.guardians.forEach((g, i) => {
        if (!g.full_name.trim() || !g.relationship.trim() || !/^[0-9+ .-]{6,20}$/.test(g.phone)) {
          e[`guardian_${i}`] = 'Nhập đủ họ tên, quan hệ và SĐT hợp lệ của người giám hộ';
        }
      });
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (validate()) onSubmit(v);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Alert kind="info">
        SĐT không phải khóa định danh — trẻ dùng SĐT của mẹ vẫn có hồ sơ riêng (mã BN riêng). Khi tìm theo SĐT, lễ tân
        chọn đúng người theo họ tên và ngày sinh.
      </Alert>

      <Card title="Thông tin hành chính">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field label="Họ và tên" required error={errors.full_name} className="lg:col-span-2">
            <Input value={v.full_name} onChange={(e) => set('full_name', e.target.value)} autoFocus={mode === 'create'} />
          </Field>
          <Field label="Giới tính">
            <Select value={v.gender} onChange={(e) => set('gender', e.target.value as Gender | '')}>
              <option value="">— Chọn —</option>
              <option value="MALE">Nam</option>
              <option value="FEMALE">Nữ</option>
              <option value="OTHER">Khác</option>
            </Select>
          </Field>
          <Field
            label="Ngày sinh"
            error={errors.date_of_birth}
            hint={age !== null && age >= 0 ? `${age} tuổi${under15 ? ' — dưới 15 tuổi, cần người giám hộ' : ''}` : undefined}
          >
            <Input type="date" max={todayStr()} value={v.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} />
          </Field>
          <Field label="Số điện thoại liên hệ" error={errors.phone} hint={under15 ? 'Có thể dùng SĐT của bố/mẹ' : undefined}>
            <Input inputMode="tel" value={v.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={v.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Địa chỉ" className="md:col-span-2 lg:col-span-3">
            <Input value={v.address} onChange={(e) => set('address', e.target.value)} />
          </Field>
          <Field label="Tiền sử bệnh / dị ứng" hint="Hiển thị nổi bật ở hồ sơ để bác sĩ lưu ý" className="md:col-span-2 lg:col-span-3">
            <Textarea rows={2} value={v.medical_history} onChange={(e) => set('medical_history', e.target.value)} />
          </Field>
          <Field label="Ghi chú" className="md:col-span-2 lg:col-span-3">
            <Textarea rows={2} value={v.note} onChange={(e) => set('note', e.target.value)} />
          </Field>
          {mode === 'edit' && (
            <Field label="Trạng thái hồ sơ" hint="Hồ sơ không bị xóa; chỉ chuyển sang lưu trữ (lưu 5 năm từ lần khám cuối)">
              <Select value={v.status} onChange={(e) => set('status', e.target.value as PatientStatus)}>
                <option value="ACTIVE">Đang theo dõi</option>
                <option value="ARCHIVED">Lưu trữ</option>
              </Select>
            </Field>
          )}
        </div>
      </Card>

      {legacy && (
        <Card title="Thông tin hồ sơ giấy cũ (BN-06)">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Số hồ sơ giấy" hint="Ví dụ: HS-2019-0457">
              <Input value={v.legacy_record_no} onChange={(e) => set('legacy_record_no', e.target.value)} />
            </Field>
            {mode === 'create' && (
              <Field label="Ngày khám cuối trên hồ sơ giấy" error={errors.last_visit_at} hint="Dùng để tính thời hạn lưu trữ và báo cáo khách lâu chưa quay lại">
                <Input type="date" max={todayStr()} value={v.last_visit_at} onChange={(e) => set('last_visit_at', e.target.value)} />
              </Field>
            )}
          </div>
          {mode === 'create' && (
            <p className="mt-3 text-sm text-slate-500">
              Chỉ nhập thông tin hành chính. Ảnh scan hồ sơ giấy được tải lên ở tab «Tài liệu» trong trang hồ sơ sau khi lưu.
            </p>
          )}
        </Card>
      )}

      {mode === 'create' && (
        <Card
          title={under15 ? 'Người giám hộ (bắt buộc — bệnh nhân dưới 15 tuổi)' : 'Người giám hộ'}
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => set('guardians', [...v.guardians, emptyGuardian(v.phone, v.guardians.length === 0)])}
            >
              <Plus className="h-3.5 w-3.5" /> Thêm người giám hộ
            </Button>
          }
        >
          {!showGuardians ? (
            <p className="text-sm text-slate-500">Không bắt buộc với bệnh nhân từ 15 tuổi trở lên.</p>
          ) : (
            <div className="space-y-3">
              {errors.guardians && <Alert kind="error">{errors.guardians}</Alert>}
              {v.guardians.map((g, i) => (
                <div key={i} className="rounded-md border border-slate-200 p-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1.5fr_auto]">
                    <Field label="Họ tên người giám hộ" required>
                      <Input value={g.full_name} onChange={(e) => setGuardian(i, { full_name: e.target.value })} />
                    </Field>
                    <Field label="Quan hệ" required>
                      <Input list="guardian-relationships" value={g.relationship} onChange={(e) => setGuardian(i, { relationship: e.target.value })} />
                    </Field>
                    <Field label="SĐT" required>
                      <Input inputMode="tel" value={g.phone} onChange={(e) => setGuardian(i, { phone: e.target.value })} />
                    </Field>
                    <div className="flex items-end gap-2 pb-0.5">
                      <label className="inline-flex items-center gap-1.5 whitespace-nowrap pb-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="primary-guardian"
                          className="accent-teal-600"
                          checked={g.is_primary}
                          onChange={() => setGuardian(i, { is_primary: true })}
                        />
                        Liên hệ chính
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mb-1"
                        aria-label="Xóa người giám hộ"
                        onClick={() => set('guardians', v.guardians.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  {errors[`guardian_${i}`] && <p className="mt-1 text-xs text-red-600">{errors[`guardian_${i}`]}</p>}
                </div>
              ))}
              <datalist id="guardian-relationships">
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
          )}
        </Card>
      )}

      {mode === 'edit' && (
        <p className="text-sm text-slate-500">Người giám hộ được thêm/sửa trong tab «Thông tin & người giám hộ» của trang hồ sơ.</p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" loading={submitting}>
          {mode === 'create' ? (legacy ? 'Lưu hồ sơ số hóa' : 'Đăng ký bệnh nhân') : 'Lưu thay đổi'}
        </Button>
      </div>
    </form>
  );
}
