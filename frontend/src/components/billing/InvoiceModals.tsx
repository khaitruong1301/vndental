'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate, fmtMoney } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import type { InvoiceDetail, PaymentMethod } from './types';

function toAmount(value: string): number {
  return Number(value.replace(/[^\d]/g, '')) || 0;
}

/* ------------------------------ TT-03: Giảm giá ------------------------------ */

export function DiscountModal({
  invoice,
  open,
  onClose,
  onDone,
}: {
  invoice: InvoiceDetail;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const { run, busy } = useAction();
  // Hóa đơn đã thu tiền: đổi giảm giá là điều chỉnh hóa đơn (TT-08, chỉ Quản lý) — luôn phải ghi lý do, có lịch sử
  const adjust = invoice.paid_amount > 0;

  useEffect(() => {
    if (open) {
      setAmount(invoice.discount_amount ? String(Math.round(Number(invoice.discount_amount))) : '');
      setReason(adjust ? '' : (invoice.discount_reason ?? ''));
    }
  }, [open, adjust, invoice.discount_amount, invoice.discount_reason]);

  // Sau giảm, tổng hóa đơn không được nhỏ hơn số đã thu
  const max = invoice.subtotal - invoice.paid_amount;
  const value = toAmount(amount);
  const reasonRequired = adjust || value > 0;
  const error =
    value > max
      ? `Tối đa ${fmtMoney(max)} (tổng sau giảm không được thấp hơn số đã thu ${fmtMoney(invoice.paid_amount)})`
      : null;

  async function submit() {
    const ok = await run(
      () => api.post(`/billing/invoices/${invoice.id}/discount`, { amount: value, reason }),
      adjust ? 'Đã điều chỉnh giảm giá' : value > 0 ? 'Đã áp dụng giảm giá' : 'Đã bỏ giảm giá',
    );
    if (ok) {
      onClose();
      onDone();
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={adjust ? 'Điều chỉnh giảm giá (TT-08)' : 'Áp dụng giảm giá (TT-03)'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={submit} loading={busy} disabled={!!error || (reasonRequired && !reason.trim())}>
            {adjust ? 'Điều chỉnh' : 'Áp dụng'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {adjust && (
          <Alert kind="warning" title="Hóa đơn đã thu tiền">
            Đã thu {fmtMoney(invoice.paid_amount)}. Thay đổi giảm giá lúc này là điều chỉnh hóa đơn: bắt buộc ghi lý do, hệ thống
            lưu tổng trước/sau và người thực hiện vào lịch sử điều chỉnh.
          </Alert>
        )}
        <Alert kind="info">
          Nhập số tiền giảm theo tổng hóa đơn. Hệ thống tự phân bổ xuống từng dòng theo tỷ lệ giá trị (làm tròn đến đồng)
          để báo cáo doanh thu theo bác sĩ, theo dịch vụ luôn chính xác. Nhập 0 để bỏ giảm giá.
        </Alert>
        <div className="text-sm text-slate-600">
          Tạm tính: <b>{fmtMoney(invoice.subtotal)}</b>
        </div>
        <Field label="Số tiền giảm (đ)" required error={error}>
          <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </Field>
        <div className="flex flex-wrap gap-2">
          {[5, 10, 15, 20].map((p) => (
            <Button key={p} size="sm" variant="secondary" onClick={() => setAmount(String(Math.round((invoice.subtotal * p) / 100)))}>
              {p}%
            </Button>
          ))}
        </div>
        <Field label={adjust ? 'Lý do điều chỉnh' : 'Lý do giảm giá'} required={reasonRequired}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Vd: Khách quen, khách được giới thiệu..." />
        </Field>
        {value > 0 && !error && (
          <div className="text-sm text-slate-600">
            Tổng sau giảm: <b className="text-slate-900">{fmtMoney(invoice.subtotal - value)}</b>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------ TT-04: Thu tiền ------------------------------ */

export function PaymentModal({
  invoice,
  open,
  onClose,
  onDone,
}: {
  invoice: InvoiceDetail;
  open: boolean;
  onClose: () => void;
  onDone: (payment: { id: number; receipt_code: string }) => void;
}) {
  const pendingInstallments = useMemo(
    () => invoice.installments.filter((i) => i.paid_amount < i.amount),
    [invoice.installments],
  );
  const [installmentId, setInstallmentId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const { run, busy } = useAction();

  function defaultAmountFor(id: string): number {
    const inst = invoice.installments.find((i) => String(i.id) === id);
    return inst ? Math.min(inst.amount - inst.paid_amount, invoice.balance_due) : invoice.balance_due;
  }

  useEffect(() => {
    if (!open) return;
    const firstPending = pendingInstallments[0] ? String(pendingInstallments[0].id) : '';
    setInstallmentId(firstPending);
    setAmount(String(defaultAmountFor(firstPending)));
    setMethod('CASH');
    setRef('');
    setNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const value = toAmount(amount);
  const error =
    value <= 0 ? 'Số tiền phải lớn hơn 0' : value > invoice.balance_due ? `Không được vượt số còn nợ ${fmtMoney(invoice.balance_due)}` : null;

  async function submit() {
    const payment = await run(
      () =>
        api.post<{ id: number; receipt_code: string }>(`/billing/invoices/${invoice.id}/payments`, {
          amount: value,
          method,
          transaction_ref: method === 'BANK_TRANSFER' ? ref : null,
          installment_id: installmentId ? Number(installmentId) : null,
          note,
        }),
      'Đã ghi nhận lần thu tiền',
    );
    if (payment) {
      onClose();
      onDone(payment);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Thu tiền — ${invoice.invoice_code}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={submit} loading={busy} disabled={!!error}>
            Xác nhận thu {value > 0 ? fmtMoney(value) : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 rounded-md bg-slate-50 p-3 text-sm">
          <div>
            <div className="text-xs text-slate-500">Tổng hóa đơn</div>
            <div className="font-medium">{fmtMoney(invoice.total_amount)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Đã thu</div>
            <div className="font-medium">{fmtMoney(invoice.paid_amount)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Còn nợ</div>
            <div className="font-semibold text-red-600">{fmtMoney(invoice.balance_due)}</div>
          </div>
        </div>

        {invoice.installments.length > 0 && (
          <Field label="Đợt thanh toán liệu trình">
            <Select
              value={installmentId}
              onChange={(e) => {
                setInstallmentId(e.target.value);
                setAmount(String(defaultAmountFor(e.target.value)));
              }}
            >
              <option value="">— Không gắn đợt —</option>
              {invoice.installments.map((i) => (
                <option key={i.id} value={i.id} disabled={i.paid_amount >= i.amount}>
                  Đợt {i.installment_no}: {fmtMoney(i.amount)}
                  {i.due_date ? ` · hạn ${fmtDate(i.due_date)}` : ''} · đã thu {fmtMoney(i.paid_amount)}
                  {i.paid_amount >= i.amount ? ' (đã đủ)' : ''}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Số tiền thu (đ)" required error={amount ? error : null}>
          <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>

        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Phương thức</span>
          <div className="flex gap-4">
            {(
              [
                ['CASH', 'Tiền mặt'],
                ['BANK_TRANSFER', 'Chuyển khoản'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="method"
                  className="accent-teal-600"
                  checked={method === key}
                  onChange={() => setMethod(key)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {method === 'BANK_TRANSFER' && (
          <Field label="Mã giao dịch" hint="Dùng để đối soát với sao kê ngân hàng">
            <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Vd: FT26307100003" />
          </Field>
        )}
        <Field label="Ghi chú">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------ TT-08: Hủy hóa đơn ------------------------------ */

export function VoidModal({
  invoice,
  open,
  onClose,
  onDone,
}: {
  invoice: InvoiceDetail;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const { run, busy } = useAction();

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  async function submit() {
    if (!window.confirm(`Xác nhận hủy hóa đơn ${invoice.invoice_code}? Thao tác không thể hoàn tác.`)) return;
    const ok = await run(
      () => api.post(`/billing/invoices/${invoice.id}/void`, { reason }),
      `Đã hủy hóa đơn ${invoice.invoice_code}`,
    );
    if (ok) {
      onClose();
      onDone();
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Hủy hóa đơn ${invoice.invoice_code} (TT-08)`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
          <Button variant="danger" onClick={submit} loading={busy} disabled={!reason.trim()}>
            Hủy hóa đơn
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert kind="warning">
          Hóa đơn không bị xóa mà chuyển sang trạng thái «Đã hủy», hệ thống ghi lại lý do và người thực hiện.
          {invoice.treatment_record_id && ' Phiếu điều trị liên quan quay về «Chờ thanh toán» để lập lại hóa đơn.'}
          {invoice.paid_amount > 0 && ` Hóa đơn đã thu ${fmtMoney(invoice.paid_amount)} — cần xử lý hoàn tiền/chuyển khoản thu sang hóa đơn mới.`}
        </Alert>
        <Field label="Lý do hủy" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Vd: Phiếu ghi sai số răng, lập lại hóa đơn" />
        </Field>
      </div>
    </Modal>
  );
}
