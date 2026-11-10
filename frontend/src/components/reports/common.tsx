'use client';

import Link from 'next/link';
import { type FocusEvent, type MouseEvent, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { Button, Card, cn, Input } from '@/components/ui';
import { fmtMoney } from '@/lib/format';

// Bảng màu biểu đồ (palette tham chiếu của skill dataviz, chế độ sáng)
export const SERIES = ['#2a78d6', '#eb6834'] as const;
// Thang tuần tự một sắc độ (xanh) cho heatmap: nhạt = thấp, đậm = cao
export const SEQ_BLUE = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'] as const;

/* ------------------------------- Định dạng ------------------------------- */

/** 'YYYY-MM' hoặc 'YYYY-MM-DD' → 'T11/2026' */
export function fmtMonth(value: string): string {
  const [y, m] = value.split('-');
  return `T${Number(m)}/${y}`;
}

/** Số tiền rút gọn cho trục/nhãn biểu đồ: 35 tr, 1,2 tỷ */
export function fmtCompactMoney(value: number): string {
  const abs = Math.abs(value);
  const fmt = (v: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(v);
  if (abs >= 1e9) return `${fmt(value / 1e9)} tỷ`;
  if (abs >= 1e6) return `${fmt(value / 1e6)} tr`;
  if (abs >= 1e3) return `${fmt(value / 1e3)} k`;
  return fmt(value);
}

export function fmtPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(value)}%`;
}

/** % thay đổi có dấu và mũi tên — không dùng màu làm tín hiệu duy nhất */
export function ChangeText({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined) return <span className="text-slate-400">—</span>;
  const up = pct > 0;
  const down = pct < 0;
  return (
    <span className={cn('font-medium', up && 'text-emerald-700', down && 'text-red-700', !up && !down && 'text-slate-600')}>
      {up ? '▲ +' : down ? '▼ ' : ''}
      {fmtPct(pct)}
    </span>
  );
}

export function pctChange(current: number, previous: number): number | null {
  return previous > 0 ? Math.round((1000 * (current - previous)) / previous) / 10 : null;
}

/* ------------------------------- Xuất CSV ------------------------------- */

type CsvCell = string | number | boolean | null | undefined;

/** Tải CSV ở trình duyệt; BOM UTF-8 để Excel hiển thị đúng tiếng Việt */
export function downloadCsv(filename: string, headers: string[], rows: CsvCell[][]): void {
  const escape = (v: CsvCell) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + [headers, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CsvButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="secondary" onClick={onClick} disabled={disabled}>
      <Download className="h-4 w-4" /> Xuất CSV
    </Button>
  );
}

/* ------------------------------- Khung báo cáo ------------------------------- */

export function MonthPicker({ value, onChange }: { value: string; onChange: (month: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      Tháng
      <Input type="month" className="w-40" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />
    </label>
  );
}

/** Đầu mỗi báo cáo: câu hỏi của quản lý + bộ lọc + nút xuất CSV */
export function ReportToolbar({ code, question, children }: { code: string; question: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-600">
        <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">{code}</span>
        {question}
      </p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function KpiRow({ children }: { children: ReactNode }) {
  return <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}

export function ChartCard({ title, legend, children }: { title: ReactNode; legend?: ReactNode; children: ReactNode }) {
  return (
    <Card title={title} actions={legend} className="mb-4">
      {children}
    </Card>
  );
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
      {items.map((i) => (
        <span key={i.name} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.name}
        </span>
      ))}
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-teal-700 hover:underline">
      {children}
    </Link>
  );
}

/* ------------------------------- Tooltip ------------------------------- */

/** Tooltip khi rê chuột / focus bàn phím trên phần tử của biểu đồ */
export function useChartTooltip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; w: number; content: ReactNode } | null>(null);

  function place(x: number, y: number, content: ReactNode) {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ x: x - box.left, y: y - box.top, w: box.width, content });
  }

  const bind = (content: ReactNode, label: string) => ({
    tabIndex: 0,
    'aria-label': label,
    onMouseEnter: (e: MouseEvent) => place(e.clientX, e.clientY, content),
    onMouseMove: (e: MouseEvent) => place(e.clientX, e.clientY, content),
    onMouseLeave: () => setTip(null),
    onFocus: (e: FocusEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      place(r.left + r.width / 2, r.top, content);
    },
    onBlur: () => setTip(null),
  });

  // Đo tooltip rồi đặt: bên phải con trỏ, tràn thì lật sang trái, cuối cùng kẹp trong khung biểu đồ
  const tipRef = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!tip || !tipRef.current) {
      setLeft(null);
      return;
    }
    const width = tipRef.current.offsetWidth;
    let x = tip.x + 12;
    if (x + width > tip.w) x = tip.x - 12 - width;
    setLeft(Math.max(0, Math.min(x, tip.w - width)));
  }, [tip]);

  const node = tip && (
    <div
      ref={tipRef}
      role="tooltip"
      className="pointer-events-none absolute z-20 min-w-36 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-lg"
      style={{
        left: left ?? tip.x + 12,
        top: tip.y + 12,
        maxWidth: tip.w,
        visibility: left === null ? 'hidden' : undefined,
      }}
    >
      {tip.content}
    </div>
  );

  return { ref, bind, node };
}

export function TipRow({ color, label, value }: { color?: string; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-slate-500">
        {color && <span className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} />}
        {label}
      </span>
      <span className="whitespace-nowrap font-medium text-slate-900">{value}</span>
    </div>
  );
}

/* ------------------------------- Biểu đồ thanh ngang ------------------------------- */

export interface HBarRow {
  key: string | number;
  label: ReactNode;
  values: number[];
}

/**
 * Thanh ngang theo danh mục (bác sĩ, lý do hủy...). Thanh ≤ 12px, đầu dữ liệu bo 4px,
 * gốc vuông; giá trị chuỗi đầu tiên ghi ở đầu thanh bằng màu chữ, không dùng màu dữ liệu.
 */
export function HBarChart({
  rows,
  series,
  format = (v) => String(v),
  labelWidth = '11rem',
}: {
  rows: HBarRow[];
  series: { name: string; color: string }[];
  format?: (value: number) => string;
  labelWidth?: string;
}) {
  const { ref, bind, node } = useChartTooltip();
  const max = Math.max(1, ...rows.flatMap((r) => r.values));
  // Chừa chỗ cố định cho nhãn giá trị ở mọi dòng để mọi thanh dùng chung một độ dài trục
  const valueSlot = `calc(${Math.max(1, ...rows.map((r) => format(r.values[0] ?? 0).length))}ch + 0.5rem)`;

  if (!rows.length) return <p className="py-6 text-center text-sm text-slate-500">Không có dữ liệu</p>;

  return (
    <div ref={ref} className="relative space-y-3" role="list">
      {rows.map((row) => {
        const label = typeof row.label === 'string' ? row.label : String(row.key);
        const tipContent = (
          <>
            <div className="mb-1 font-medium text-slate-900">{row.label}</div>
            {series.map((s, i) => (
              <TipRow key={s.name} color={s.color} label={s.name} value={format(row.values[i] ?? 0)} />
            ))}
          </>
        );
        const aria = `${label}: ${series.map((s, i) => `${s.name} ${format(row.values[i] ?? 0)}`).join(', ')}`;
        return (
          <div
            key={row.key}
            role="listitem"
            className="grid items-center gap-3 rounded outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            style={{ gridTemplateColumns: `min(${labelWidth}, 40%) minmax(0, 1fr)` }}
            {...bind(tipContent, aria)}
          >
            <div className="truncate text-sm text-slate-700">{row.label}</div>
            <div className="flex flex-col gap-0.5 py-1">
              {series.map((s, i) => {
                const v = row.values[i] ?? 0;
                return (
                  <div key={s.name} className="min-w-0 text-xs" style={{ paddingRight: valueSlot }}>
                    <div className="relative h-3">
                      <div
                        className="h-3 rounded-r"
                        style={{ width: `${(v / max) * 100}%`, minWidth: v > 0 ? 2 : 0, background: s.color }}
                      />
                      {i === 0 && (
                        <span
                          className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap leading-none text-slate-700"
                          style={{ left: `calc(${(v / max) * 100}% + 0.5rem)` }}
                        >
                          {format(v)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {node}
    </div>
  );
}

/* ------------------------------- Biểu đồ cột theo tháng ------------------------------- */

/** Cột theo thời gian (1–2 chuỗi, chung một trục), lưới mờ, tooltip theo nhóm */
export function ColumnChart({
  groups,
  series,
  format,
  axisFormat,
  tipExtra,
}: {
  groups: { key: string; label: string; values: number[] }[];
  series: { name: string; color: string }[];
  format: (value: number) => string;
  axisFormat: (value: number) => string;
  tipExtra?: (index: number) => ReactNode;
}) {
  const { ref, bind, node } = useChartTooltip();
  const max = Math.max(1, ...groups.flatMap((g) => g.values));
  const ticks = [1, 0.5, 0];
  const height = 180;

  return (
    <div ref={ref} className="relative">
      <div className="flex">
        <div className="relative w-14 shrink-0" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-2 -translate-y-1/2 text-[11px] text-slate-400" style={{ top: (1 - t) * height }}>
              {axisFormat(max * t)}
            </span>
          ))}
        </div>
        <div className="relative flex-1 overflow-x-auto">
          <div className="relative min-w-[480px]" style={{ height }}>
            {ticks.map((t) => (
              <div
                key={t}
                className={cn('absolute inset-x-0 border-t', t === 0 ? 'border-slate-300' : 'border-dashed border-slate-100')}
                style={{ top: (1 - t) * height }}
              />
            ))}
            <div className="absolute inset-0 flex items-end">
              {groups.map((g, gi) => {
                const tip = (
                  <>
                    <div className="mb-1 font-medium text-slate-900">{g.label}</div>
                    {series.map((s, i) => (
                      <TipRow key={s.name} color={s.color} label={s.name} value={format(g.values[i] ?? 0)} />
                    ))}
                    {tipExtra?.(gi)}
                  </>
                );
                const aria = `${g.label}: ${series.map((s, i) => `${s.name} ${format(g.values[i] ?? 0)}`).join(', ')}`;
                return (
                  <div
                    key={g.key}
                    className="flex h-full flex-1 items-end justify-center gap-0.5 rounded-t outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-teal-500"
                    {...bind(tip, aria)}
                  >
                    {series.map((s, i) => {
                      const v = g.values[i] ?? 0;
                      return (
                        <div
                          key={s.name}
                          className="w-3.5 rounded-t"
                          style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? 2 : 0, background: s.color }}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex min-w-[480px] pt-1">
            {groups.map((g) => (
              <div key={g.key} className="flex-1 text-center text-[11px] text-slate-500">
                {g.label}
              </div>
            ))}
          </div>
        </div>
      </div>
      {node}
    </div>
  );
}

/* ------------------------------- Thanh tiến độ ------------------------------- */

export function Meter({ value, max, label }: { value: number; max: number; label: ReactNode }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="min-w-40">
      <div className="mb-1 text-xs text-slate-600">{label}</div>
      <div
        className="h-2 w-full rounded-full bg-slate-100"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: SERIES[0] }} />
      </div>
    </div>
  );
}

export const money = (v: number) => fmtMoney(v);
