'use client';

import { useEffect, useState } from 'react';
import { Button, cn, Modal } from '@/components/ui';
import type { ToothScope } from './types';

// Sơ đồ FDI nhìn từ phía bác sĩ: phải bệnh nhân (Q1, Q4) bên trái
const PERMANENT_UPPER = [
  [18, 17, 16, 15, 14, 13, 12, 11],
  [21, 22, 23, 24, 25, 26, 27, 28],
];
const PERMANENT_LOWER = [
  [48, 47, 46, 45, 44, 43, 42, 41],
  [31, 32, 33, 34, 35, 36, 37, 38],
];
const PRIMARY_UPPER = [
  [55, 54, 53, 52, 51],
  [61, 62, 63, 64, 65],
];
const PRIMARY_LOWER = [
  [85, 84, 83, 82, 81],
  [71, 72, 73, 74, 75],
];
const JAWS = [
  { code: 'FULL', label: 'Toàn hàm' },
  { code: 'UPPER', label: 'Hàm trên' },
  { code: 'LOWER', label: 'Hàm dưới' },
];

const isJaw = (code: string) => JAWS.some((j) => j.code === code);

/** Chọn số răng FDI (11–48, răng sữa 51–85) hoặc phạm vi hàm, theo tooth_scope của dịch vụ */
export function ToothPicker({
  open,
  onClose,
  scope,
  initial,
  multiple = true,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  scope: ToothScope;
  initial: string[];
  multiple?: boolean;
  onConfirm: (codes: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (open) setSelected(initial.filter(Boolean));
    // chỉ khởi tạo lại khi mở hộp thoại
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const allowTooth = scope !== 'JAW';
  const allowJaw = scope !== 'TOOTH';

  function toggleTooth(code: string) {
    setSelected((cur) => {
      const teeth = cur.filter((c) => !isJaw(c));
      if (!multiple) return [code];
      return teeth.includes(code) ? teeth.filter((c) => c !== code) : [...teeth, code];
    });
  }

  const toothButton = (n: number) => {
    const code = String(n);
    const active = selected.includes(code);
    return (
      <button
        key={code}
        type="button"
        disabled={!allowTooth}
        onClick={() => toggleTooth(code)}
        className={cn(
          'h-9 w-9 rounded-md border text-xs font-semibold transition',
          active
            ? 'border-teal-600 bg-teal-600 text-white'
            : 'border-slate-300 bg-white text-slate-700 hover:border-teal-400 hover:bg-teal-50',
          !allowTooth && 'cursor-not-allowed opacity-40',
        )}
      >
        {code}
      </button>
    );
  };

  const arch = (rows: number[][], title: string) => (
    <div>
      <div className="mb-1 text-center text-xs text-slate-500">{title}</div>
      <div className="flex justify-center gap-3">
        <div className="flex gap-1">{rows[0].map(toothButton)}</div>
        <div className="w-px bg-slate-300" />
        <div className="flex gap-1">{rows[1].map(toothButton)}</div>
      </div>
    </div>
  );

  const teeth = selected.filter((c) => !isJaw(c));
  const summary =
    selected.length === 0
      ? 'Chưa chọn'
      : isJaw(selected[0])
        ? JAWS.find((j) => j.code === selected[0])?.label
        : `Đã chọn ${teeth.length} răng: ${teeth.join(', ')}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Chọn số răng (sơ đồ FDI)"
      footer={
        <>
          <span className="mr-auto self-center text-sm text-slate-500">{summary}</span>
          <Button variant="secondary" onClick={() => setSelected([])}>
            Bỏ chọn
          </Button>
          <Button disabled={!selected.length} onClick={() => onConfirm(selected)}>
            Xác nhận
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {JAWS.map((j) => (
            <button
              key={j.code}
              type="button"
              disabled={!allowJaw}
              onClick={() => setSelected([j.code])}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm font-medium',
                selected.includes(j.code)
                  ? 'border-teal-600 bg-teal-600 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-teal-50',
                !allowJaw && 'cursor-not-allowed opacity-40',
              )}
            >
              {j.label}
            </button>
          ))}
          {scope === 'TOOTH' && <span className="text-xs text-slate-500">Dịch vụ này phải chọn răng cụ thể</span>}
          {scope === 'JAW' && <span className="text-xs text-slate-500">Dịch vụ này chỉ chọn theo hàm</span>}
        </div>
        <div className="space-y-3 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-center text-xs font-semibold uppercase tracking-wide text-slate-400">Răng vĩnh viễn</div>
          {arch(PERMANENT_UPPER, 'Hàm trên')}
          {arch(PERMANENT_LOWER, 'Hàm dưới')}
          <div className="border-t border-slate-200 pt-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
            Răng sữa
          </div>
          {arch(PRIMARY_UPPER, 'Hàm trên')}
          {arch(PRIMARY_LOWER, 'Hàm dưới')}
        </div>
        {multiple && allowTooth && (
          <p className="text-xs text-slate-500">Chọn nhiều răng sẽ tạo mỗi răng một dòng dịch vụ.</p>
        )}
      </div>
    </Modal>
  );
}
