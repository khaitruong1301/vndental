export function ProgressBar({ value, max, tone = 'teal' }: { value: number; max: number; tone?: 'teal' | 'emerald' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={tone === 'teal' ? 'h-full bg-teal-500' : 'h-full bg-emerald-500'} style={{ width: `${pct}%` }} />
    </div>
  );
}
