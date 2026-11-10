'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import type { CashClosing, CashSummary, Shift } from '@/components/billing/types';
import {
  Alert,
  AsyncBoundary,
  Badge,
  Button,
  Card,
  DataTable,
  Field,
  Input,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  cn,
} from '@/components/ui';
import { api } from '@/lib/api';
import { RequirePerm, useAuth } from '@/lib/auth';
import { addDays, fmtDate, fmtDateTime, fmtMoney, fmtTime, todayStr } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';
import { labelOf, PAYMENT_METHOD, SHIFT } from '@/lib/labels';

export default function CashClosingPage() {
  return (
    <RequirePerm perms={['TT-07']}>
      <CashClosingView />
    </RequirePerm>
  );
}

function CashClosingView() {
  const { user } = useAuth();
  const [date, setDate] = useState(todayStr());
  const [shift, setShift] = useState<Shift | ''>('');
  const summary = useApi<CashSummary>('/billing/cash-closing/summary', { date, shift });
  const [historyFrom, setHistoryFrom] = useState(addDays(todayStr(), -30));
  const history = useApi<CashClosing[]>('/billing/cash-closings', { date_from: historyFrom });

  // Lần đầu: lấy ca hiện tại theo giờ phòng khám từ server
  useEffect(() => {
    if (!shift && summary.data) setShift(summary.data.shift);
  }, [shift, summary.data]);

  const s = summary.data;
  // Ca chiều hôm nay chưa bắt đầu (trước 14:00 giờ phòng khám) thì chưa được chốt két
  const afternoonNotStarted = !!s && date === s.current_date && s.current_shift === 'MORNING';
  const notStarted = !!s && s.work_date === s.current_date && s.shift === 'AFTERNOON' && s.current_shift === 'MORNING';

  return (
    <>
      <PageHeader title="Chốt két cuối ca" subtitle="So tiền mặt đếm thực tế với tiền mặt đã thu trong ca (TT-07)" />
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Ngày">
            <Input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Ca">
            <Select value={shift} onChange={(e) => setShift(e.target.value as Shift)}>
              <option value="MORNING">Ca sáng</option>
              <option value="AFTERNOON" disabled={afternoonNotStarted}>
                Ca chiều{afternoonNotStarted ? ' (chưa bắt đầu)' : ''}
              </option>
            </Select>
          </Field>
          <div className="pb-2 text-sm text-slate-500">
            Lễ tân: <b className="text-slate-800">{user.name}</b>
            {s && s.work_date === s.current_date && s.shift === s.current_shift && (
              <span className="ml-2">
                <Badge color="teal">Ca hiện tại</Badge>
              </span>
            )}
          </div>
        </div>
      </Card>

      <AsyncBoundary loading={summary.loading && !s} error={summary.error}>
        {s && (
          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card
              title={`Các lần thu của tôi — ${labelOf(SHIFT, s.shift).label} ${fmtDate(s.work_date)}`}
              className="lg:col-span-2"
              bodyClassName="p-0"
            >
              <DataTable
                rows={s.payments}
                rowKey={(p) => p.id}
                empty="Chưa có lần thu nào trong ca"
                columns={[
                  {
                    key: 'code',
                    header: 'Phiếu thu',
                    render: (p) => (
                      <>
                        <div className="font-medium">{p.receipt_code}</div>
                        <div className="text-xs text-slate-500">{fmtTime(p.paid_at)}</div>
                      </>
                    ),
                  },
                  {
                    key: 'invoice',
                    header: 'Hóa đơn · Bệnh nhân',
                    render: (p) => (
                      <>
                        <Link href={`/invoices/${p.invoice_id}`} className="text-teal-700 hover:underline">
                          {p.invoice_code}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {p.patient_name} · {p.patient_code}
                        </div>
                      </>
                    ),
                  },
                  {
                    key: 'method',
                    header: 'Phương thức',
                    render: (p) => (
                      <>
                        <StatusBadge label={labelOf(PAYMENT_METHOD, p.method)} />
                        {p.transaction_ref && <div className="text-xs text-slate-500">{p.transaction_ref}</div>}
                      </>
                    ),
                  },
                  { key: 'amount', header: 'Số tiền', align: 'right', render: (p) => <b>{fmtMoney(p.amount)}</b> },
                  {
                    key: 'lock',
                    header: '',
                    render: (p) => (p.is_closed ? <Lock className="h-4 w-4 text-slate-400" /> : null),
                  },
                ]}
              />
              <div className="grid grid-cols-2 gap-3 border-t border-slate-100 px-4 py-3 text-sm">
                <div>
                  <div className="text-xs text-slate-500">Tiền mặt (tính vào két)</div>
                  <div className="text-lg font-semibold">{fmtMoney(s.cash_total)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Chuyển khoản</div>
                  <div className="text-lg font-semibold text-slate-600">{fmtMoney(s.transfer_total)}</div>
                  <div className="text-xs text-slate-500">Đối soát riêng với sao kê, không tính vào két</div>
                </div>
              </div>
            </Card>

            {s.closing ? (
              <ClosingResult closing={s.closing} />
            ) : notStarted ? (
              <Card title="Chốt két">
                <Alert kind="info">Ca chiều hôm nay chưa bắt đầu (từ 14:00) — chưa thể chốt két.</Alert>
              </Card>
            ) : (
              <CloseForm
                summary={s}
                onClosed={() => {
                  summary.reload();
                  history.reload();
                }}
              />
            )}
          </div>
        )}
      </AsyncBoundary>

      <Card
        title="Lịch sử chốt két"
        bodyClassName="p-0"
        actions={
          <div className="flex items-center gap-2 text-sm text-slate-600">
            Từ ngày
            <Input type="date" className="w-40 py-1" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)} />
          </div>
        }
      >
        <DataTable
          rows={history.data}
          loading={history.loading}
          rowKey={(c) => c.id}
          empty="Chưa có lần chốt két nào"
          columns={[
            {
              key: 'date',
              header: 'Ca',
              render: (c) => (
                <>
                  {fmtDate(c.work_date)} <StatusBadge label={labelOf(SHIFT, c.shift)} />
                </>
              ),
            },
            ...(user.role === 'MANAGER'
              ? [{ key: 'who', header: 'Lễ tân', render: (c: CashClosing) => `${c.receptionist_name} (${c.staff_code})` }]
              : []),
            { key: 'count', header: 'Số lần thu', align: 'right' as const, render: (c: CashClosing) => c.payment_count ?? 0 },
            { key: 'expected', header: 'Tiền mặt hệ thống', align: 'right' as const, render: (c: CashClosing) => fmtMoney(c.expected_cash) },
            { key: 'counted', header: 'Tiền đếm', align: 'right' as const, render: (c: CashClosing) => fmtMoney(c.counted_cash) },
            {
              key: 'diff',
              header: 'Chênh lệch',
              align: 'right' as const,
              render: (c: CashClosing) => <Difference value={c.difference} />,
            },
            { key: 'transfer', header: 'Chuyển khoản', align: 'right' as const, render: (c: CashClosing) => fmtMoney(c.transfer_total) },
            { key: 'note', header: 'Ghi chú', render: (c: CashClosing) => c.note ?? '' },
            { key: 'at', header: 'Chốt lúc', render: (c: CashClosing) => fmtDateTime(c.closed_at) },
          ]}
        />
      </Card>
    </>
  );
}

function CloseForm({ summary, onClosed }: { summary: CashSummary; onClosed: () => void }) {
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const { run, busy } = useAction();
  const countedValue = Number(counted.replace(/[^\d]/g, '')) || 0;
  const diff = countedValue - summary.cash_total;
  const needNote = counted !== '' && diff !== 0;

  useEffect(() => {
    setCounted('');
    setNote('');
  }, [summary.work_date, summary.shift]);

  async function submit() {
    const msg =
      `Chốt két ${labelOf(SHIFT, summary.shift).label.toLowerCase()} ngày ${fmtDate(summary.work_date)}?\n` +
      `Tiền mặt hệ thống: ${fmtMoney(summary.cash_total)} — tiền đếm: ${fmtMoney(countedValue)}.\n` +
      'Sau khi chốt không thể thêm hoặc sửa lần thu thuộc ca này.';
    if (!window.confirm(msg)) return;
    const ok = await run(
      () =>
        api.post('/billing/cash-closings', {
          work_date: summary.work_date,
          shift: summary.shift,
          counted_cash: countedValue,
          note,
        }),
      'Đã chốt két',
    );
    if (ok) onClosed();
  }

  return (
    <Card title="Chốt két">
      <div className="space-y-4">
        <div>
          <div className="text-xs text-slate-500">Tiền mặt hệ thống đã thu trong ca</div>
          <div className="text-2xl font-semibold">{fmtMoney(summary.cash_total)}</div>
        </div>
        <Field label="Tiền đếm thực tế (đ)" required>
          <Input inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0" />
        </Field>
        {counted !== '' && (
          <div className="text-sm">
            Chênh lệch: <Difference value={diff} />
          </div>
        )}
        <Field label="Ghi chú" required={needNote} hint={needNote ? 'Bắt buộc ghi chú khi tiền đếm lệch với hệ thống' : undefined}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Alert kind="warning">Sau khi chốt, mọi lần thu của ca này bị khóa — không thể thêm hoặc sửa.</Alert>
        <Button
          className="w-full"
          onClick={submit}
          loading={busy}
          disabled={counted === '' || (needNote && !note.trim())}
        >
          <Lock className="h-4 w-4" /> Chốt két
        </Button>
      </div>
    </Card>
  );
}

function ClosingResult({ closing }: { closing: CashClosing }) {
  return (
    <Card title="Ca đã chốt két">
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Tiền mặt hệ thống</dt>
          <dd>{fmtMoney(closing.expected_cash)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Tiền đếm thực tế</dt>
          <dd>{fmtMoney(closing.counted_cash)}</dd>
        </div>
        <div className="flex justify-between border-t border-slate-100 pt-2">
          <dt className="text-slate-500">Chênh lệch</dt>
          <dd>
            <Difference value={closing.difference} />
          </dd>
        </div>
        {closing.note && (
          <div>
            <dt className="text-slate-500">Ghi chú</dt>
            <dd>{closing.note}</dd>
          </div>
        )}
        <div className="pt-2 text-xs text-slate-500">
          <Lock className="mr-1 inline h-3 w-3" />
          Chốt lúc {fmtDateTime(closing.closed_at)} — các lần thu của ca đã bị khóa.
        </div>
      </dl>
    </Card>
  );
}

function Difference({ value }: { value: number }) {
  return (
    <b className={cn(value === 0 ? 'text-emerald-600' : 'text-red-600')}>
      {value > 0 ? '+' : value < 0 ? '−' : ''}
      {fmtMoney(Math.abs(value))}
      {value === 0 ? ' (khớp)' : value < 0 ? ' (thiếu)' : ' (thừa)'}
    </b>
  );
}
