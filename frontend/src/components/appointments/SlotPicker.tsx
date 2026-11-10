'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, AsyncBoundary, Badge, cn, Field, Select } from '@/components/ui';
import { useLookups } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { addMinutes, type FreeSlot, type SlotChoice } from './types';

/**
 * LH-01 / LH-07: chọn giờ + ghế còn trống cho `slots` khung 30' liên tiếp.
 * doctorId = null → hiện khung trống của mọi bác sĩ đang trực (luồng 3a).
 */
export function SlotPicker({
  date,
  doctorId,
  slots,
  excludeGroup,
  value,
  onChange,
  preferredChairId,
  refreshKey,
}: {
  date: string;
  doctorId: number | null;
  slots: number;
  excludeGroup?: string;
  value: SlotChoice | null;
  onChange: (choice: SlotChoice | null) => void;
  /** Ghế ưu tiên khi chọn giờ (vd. ô được bấm trên lưới lịch) */
  preferredChairId?: number | null;
  /** Đổi giá trị để tải lại danh sách khung trống (vd. sau khi lưu bị trùng lịch — LH-02 luồng 5a) */
  refreshKey?: number;
}) {
  const { chairs } = useLookups();
  const { data, loading, error, reload } = useApi<FreeSlot[]>(date ? '/appointments/slots' : null, {
    date,
    doctor_id: doctorId,
    slots,
    exclude_group: excludeGroup,
  });

  const byDoctor = useMemo(() => {
    const map = new Map<number, { name: string; slots: FreeSlot[] }>();
    for (const s of data ?? []) {
      if (!map.has(s.doctor_id)) map.set(s.doctor_id, { name: s.doctor_name, slots: [] });
      map.get(s.doctor_id)!.slots.push(s);
    }
    return [...map.entries()];
  }, [data]);

  const selected = data?.find((s) => s.doctor_id === value?.doctor_id && s.start_time === value?.start_time);
  /** Khung đã chọn nhưng không còn trống → bỏ chọn (để nút Lưu bị khóa) và giữ lại giờ để cảnh báo */
  const [staleTime, setStaleTime] = useState<string | null>(null);
  useEffect(() => {
    if (refreshKey) reload();
  }, [refreshKey, reload]);
  useEffect(() => {
    if (data && !loading && value && !selected) {
      setStaleTime(value.start_time);
      onChange(null);
    }
  }, [data, loading, value, selected, onChange]);
  useEffect(() => {
    if (value) setStaleTime(null);
  }, [value]);

  const chairName = (id: number) => chairs.find((c) => c.id === id)?.name ?? `Ghế ${id}`;

  function pick(slot: FreeSlot) {
    const keepChair =
      [value?.chair_id, preferredChairId].find((c): c is number => !!c && slot.free_chair_ids.includes(c)) ??
      slot.free_chair_ids[0];
    onChange({ doctor_id: slot.doctor_id, start_time: slot.start_time, chair_id: keepChair });
  }

  return (
    <AsyncBoundary loading={loading && !data} error={error}>
      {!byDoctor.length ? (
        <Alert kind="warning">
          Không còn khung trống {slots > 1 ? `${slots} khung liên tiếp ` : ''}trong ngày này
          {doctorId ? ' cho bác sĩ đã chọn (hoặc bác sĩ không có ca trực)' : ' (không có bác sĩ trực hoặc đã kín lịch)'}.
        </Alert>
      ) : (
        <div className="space-y-3">
          {byDoctor.map(([id, d]) => (
            <div key={id}>
              <div className="mb-1.5 text-sm font-medium text-slate-700">
                BS {d.name} <span className="font-normal text-slate-500">· {d.slots.length} khung trống</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {d.slots.map((s) => {
                  const active = value?.doctor_id === s.doctor_id && value.start_time === s.start_time;
                  return (
                    <button
                      key={s.start_time}
                      type="button"
                      onClick={() => pick(s)}
                      title={`Ghế trống: ${s.free_chair_ids.map(chairName).join(', ')}`}
                      className={cn(
                        'rounded-md border px-2.5 py-1 text-sm tabular-nums',
                        active
                          ? 'border-teal-600 bg-teal-600 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-teal-500 hover:bg-teal-50',
                      )}
                    >
                      {s.start_time}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {!value && staleTime && (
            <Alert kind="warning">Khung {staleTime} không còn trống — vui lòng chọn khung khác.</Alert>
          )}
          {selected && value && (
            <div className="flex flex-wrap items-end gap-3 rounded-md bg-slate-50 p-3">
              <div className="text-sm">
                <div className="text-xs text-slate-500">Đã chọn</div>
                <div className="font-medium">
                  {value.start_time}–{addMinutes(value.start_time, slots * 30)} · BS {selected.doctor_name}
                </div>
              </div>
              <Field label="Ghế" className="w-40">
                <Select
                  value={value.chair_id}
                  onChange={(e) => onChange({ ...value, chair_id: Number(e.target.value) })}
                >
                  {selected.free_chair_ids.map((c) => (
                    <option key={c} value={c}>
                      {chairName(c)}
                    </option>
                  ))}
                </Select>
              </Field>
              {slots > 1 && <Badge color="teal">{slots} khung liên tiếp</Badge>}
            </div>
          )}
        </div>
      )}
    </AsyncBoundary>
  );
}
