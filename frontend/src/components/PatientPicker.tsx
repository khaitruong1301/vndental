'use client';

import { useEffect, useState } from 'react';
import { Search, UserPlus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { ageOf, fmtDate } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import type { PatientSummary } from '@/lib/types';
import { Badge, Button, Input } from './ui';

/**
 * BN-01: tìm bệnh nhân theo SĐT / tên / mã. Một SĐT có thể ra nhiều người
 * (vd. hai chị em dùng SĐT của mẹ) → lễ tân chọn theo tên + ngày sinh.
 */
export function PatientPicker({
  value,
  onChange,
  onCreateNew,
  autoFocus,
}: {
  value: PatientSummary | null;
  onChange: (patient: PatientSummary | null) => void;
  /** Hiện nút "Đăng ký bệnh nhân mới" khi không tìm thấy (BN-02) */
  onCreateNew?: (keyword: string) => void;
  autoFocus?: boolean;
}) {
  const [keyword, setKeyword] = useState('');
  const debounced = useDebounced(keyword.trim(), 300);
  const [results, setResults] = useState<PatientSummary[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (debounced.length < 2) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get<PatientSummary[]>('/patients/search', { q: debounced })
      .then((r) => !cancelled && setResults(r))
      .catch(() => !cancelled && setResults([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-teal-200 bg-teal-50 px-3 py-2">
        <div className="text-sm">
          <div className="font-medium text-slate-900">
            {value.full_name} <span className="text-slate-500">· {value.patient_code}</span>
          </div>
          <div className="text-xs text-slate-600">
            {fmtDate(value.date_of_birth)}
            {value.date_of_birth && ` (${ageOf(value.date_of_birth)} tuổi)`} · {value.phone ?? 'Không có SĐT'}
            {value.guardian_name && ` · Giám hộ: ${value.guardian_name} (${value.guardian_relationship})`}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
          <X className="h-4 w-4" /> Đổi
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <Input
          autoFocus={autoFocus}
          className="pl-9"
          placeholder="Nhập SĐT, tên hoặc mã bệnh nhân..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>
      {debounced.length >= 2 && (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {loading && <div className="px-3 py-2 text-sm text-slate-500">Đang tìm...</div>}
          {!loading &&
            results?.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange(p);
                  setKeyword('');
                }}
                className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-teal-50"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  {p.full_name}
                  <span className="text-xs font-normal text-slate-500">{p.patient_code}</span>
                  {p.status === 'ARCHIVED' && <Badge>Lưu trữ</Badge>}
                </div>
                <div className="text-xs text-slate-600">
                  Ngày sinh {fmtDate(p.date_of_birth)} · SĐT {p.phone ?? '—'}
                  {p.guardian_name && ` · Giám hộ: ${p.guardian_name} (${p.guardian_relationship}) ${p.guardian_phone}`}
                </div>
              </button>
            ))}
          {!loading && results?.length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-500">Không tìm thấy bệnh nhân.</div>
          )}
          {!loading && onCreateNew && (
            <button
              type="button"
              onClick={() => onCreateNew(keyword.trim())}
              className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-sm font-medium text-teal-700 hover:bg-teal-50"
            >
              <UserPlus className="h-4 w-4" /> Đăng ký bệnh nhân mới
            </button>
          )}
        </div>
      )}
    </div>
  );
}
