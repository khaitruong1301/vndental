'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { moneyToWords } from '@/components/billing/moneyToWords';
import type { InvoiceDetail, InvoicePayment } from '@/components/billing/types';
import { Alert, AsyncBoundary, Button } from '@/components/ui';
import { RequirePerm, useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { labelOf, PAYMENT_METHOD, toothLabel } from '@/lib/labels';

export default function InvoicePrintPage() {
  return (
    <RequirePerm perms={['TT-05', 'TT-04', 'TT-06']}>
      <Suspense>
        <PrintView />
      </Suspense>
    </RequirePerm>
  );
}

function PrintView() {
  const { id } = useParams<{ id: string }>();
  const paymentId = useSearchParams().get('payment_id');
  const { can } = useAuth();
  const router = useRouter();
  const { data: inv, loading, error } = useApi<InvoiceDetail>(`/billing/invoices/${id}`);
  const payment = paymentId ? inv?.payments.find((p) => String(p.id) === paymentId) : undefined;

  return (
    <AsyncBoundary loading={loading && !inv} error={error}>
      {inv && (
        <>
          <div className="no-print mb-4 flex items-center justify-between">
            {can('TT-01', 'TT-04', 'TT-06') ? (
              <Link href={`/invoices/${inv.id}`}>
                <Button variant="ghost">
                  <ArrowLeft className="h-4 w-4" /> Quay lại hóa đơn
                </Button>
              </Link>
            ) : (
              <Button variant="ghost" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" /> Quay lại
              </Button>
            )}
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> In
            </Button>
          </div>
          {paymentId && !payment ? (
            <Alert kind="error">Không tìm thấy lần thu tiền này trên hóa đơn</Alert>
          ) : (
            <div className="mx-auto max-w-[210mm] bg-white p-8 text-[13px] leading-relaxed text-slate-900 shadow-sm print:max-w-none print:p-0 print:shadow-none">
              <Letterhead />
              {payment ? <ReceiptBody inv={inv} payment={payment} /> : <InvoiceBody inv={inv} />}
              <Signatures />
            </div>
          )}
        </>
      )}
    </AsyncBoundary>
  );
}

function Letterhead() {
  return (
    <div className="mb-4 border-b-2 border-slate-800 pb-3">
      <div className="text-lg font-bold uppercase tracking-wide">Nha khoa Nụ Cười Việt</div>
      <div className="text-xs text-slate-600">Phòng khám nha khoa · Hệ thống quản lý phòng khám</div>
    </div>
  );
}

function PatientBlock({ inv }: { inv: InvoiceDetail }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1">
      <Info label="Bệnh nhân" value={`${inv.patient_name} (${inv.patient_code})`} />
      <Info label="Ngày sinh" value={fmtDate(inv.patient_dob)} />
      <Info label="Điện thoại" value={inv.patient_phone ?? '—'} />
      <Info label="Địa chỉ" value={inv.patient_address ?? '—'} />
      <Info
        label={inv.invoice_type === 'VISIT' ? 'Phiếu điều trị' : 'Liệu trình'}
        value={inv.invoice_type === 'VISIT' ? `${inv.record_code} · ${fmtDateTime(inv.visit_at)}` : `${inv.plan_code} — ${inv.plan_name}`}
      />
      {inv.invoice_type === 'VISIT' && <Info label="Bác sĩ chính" value={inv.record_doctor_name ?? '—'} />}
    </div>
  );
}

function InvoiceBody({ inv }: { inv: InvoiceDetail }) {
  return (
    <>
      <div className="mb-4 text-center">
        <h1 className="text-xl font-bold uppercase">Hóa đơn dịch vụ</h1>
        <div className="text-slate-600">
          Số: <b>{inv.invoice_code}</b> · Ngày {fmtDateTime(inv.issued_at)}
        </div>
        {inv.status === 'VOIDED' && <div className="mt-1 font-bold uppercase text-red-600">Đã hủy — {inv.void_reason}</div>}
      </div>
      <PatientBlock inv={inv} />

      <table className="mb-3 w-full border-collapse">
        <thead>
          <tr className="border-y border-slate-800 text-left">
            <th className="py-1 pr-2">#</th>
            <th className="py-1 pr-2">Nội dung</th>
            <th className="py-1 pr-2">Răng</th>
            <th className="py-1 pr-2">Bác sĩ</th>
            <th className="py-1 pr-2 text-right">SL</th>
            <th className="py-1 pr-2 text-right">Đơn giá</th>
            <th className="py-1 pr-2 text-right">Giảm</th>
            <th className="py-1 text-right">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l) => (
            <tr key={l.id} className="border-b border-slate-200 align-top">
              <td className="py-1 pr-2">{l.line_no}</td>
              <td className="py-1 pr-2">{l.description}</td>
              <td className="py-1 pr-2">{l.tooth_code ? toothLabel(l.tooth_code) : ''}</td>
              <td className="py-1 pr-2">{l.performing_doctor_name ?? ''}</td>
              <td className="py-1 pr-2 text-right">{fmtNumber(l.quantity)}</td>
              <td className="py-1 pr-2 text-right">{fmtMoney(l.unit_price)}</td>
              <td className="py-1 pr-2 text-right">{l.discount_amount ? fmtMoney(l.discount_amount) : ''}</td>
              <td className="py-1 text-right">{fmtMoney(l.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto w-72 space-y-0.5">
        <Total label="Tạm tính" value={fmtMoney(inv.subtotal)} />
        {inv.discount_amount > 0 && (
          <Total label={`Giảm giá${inv.discount_reason ? ` (${inv.discount_reason})` : ''}`} value={`− ${fmtMoney(inv.discount_amount)}`} />
        )}
        <Total label="Tổng cộng" value={<b>{fmtMoney(inv.total_amount)}</b>} />
        <Total label="Đã thanh toán" value={fmtMoney(inv.paid_amount)} />
        <Total label="Còn nợ" value={<b>{inv.status === 'VOIDED' ? '—' : fmtMoney(inv.balance_due)}</b>} />
      </div>
      <div className="mt-2 italic">Bằng chữ: {moneyToWords(inv.total_amount)}.</div>

      {inv.payments.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 font-semibold">Các lần thanh toán</div>
          <table className="w-full border-collapse">
            <tbody>
              {inv.payments.map((p) => (
                <tr key={p.id} className="border-b border-slate-200">
                  <td className="py-0.5 pr-2">{p.receipt_code}</td>
                  <td className="py-0.5 pr-2">{fmtDateTime(p.paid_at)}</td>
                  <td className="py-0.5 pr-2">
                    {labelOf(PAYMENT_METHOD, p.method).label}
                    {p.transaction_ref ? ` · ${p.transaction_ref}` : ''}
                  </td>
                  <td className="py-0.5 text-right">{fmtMoney(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ReceiptBody({ inv, payment }: { inv: InvoiceDetail; payment: InvoicePayment }) {
  const voided = inv.status === 'VOIDED';
  // Số còn nợ ngay sau lần thu này (các lần thu theo thứ tự thời gian)
  const paidUpTo = inv.payments
    .slice(0, inv.payments.findIndex((p) => p.id === payment.id) + 1)
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <>
      <div className="mb-4 text-center">
        <h1 className="text-xl font-bold uppercase">Biên lai thu tiền</h1>
        <div className="text-slate-600">
          Số: <b>{payment.receipt_code}</b> · Ngày {fmtDateTime(payment.paid_at)}
        </div>
        {voided && (
          <div className="mt-1 font-bold uppercase text-red-600">Hóa đơn đã hủy — {inv.void_reason}</div>
        )}
      </div>
      <PatientBlock inv={inv} />
      <div className="mb-4 space-y-1">
        <Info label="Thu cho hóa đơn" value={`${inv.invoice_code} (tổng ${fmtMoney(inv.total_amount)})`} />
        {payment.installment_no && <Info label="Đợt thanh toán" value={`Đợt ${payment.installment_no}`} />}
        <Info
          label="Hình thức"
          value={`${labelOf(PAYMENT_METHOD, payment.method).label}${payment.transaction_ref ? ` · Mã GD ${payment.transaction_ref}` : ''}`}
        />
        <Info label="Số tiền" value={<span className="text-base font-bold">{fmtMoney(payment.amount)}</span>} />
        <Info label="Bằng chữ" value={<i>{moneyToWords(payment.amount)}</i>} />
        <Info label="Đã thu lũy kế" value={fmtMoney(paidUpTo)} />
        <Info
          label="Còn nợ sau lần thu"
          value={<b>{voided ? '—' : fmtMoney(Math.max(inv.total_amount - paidUpTo, 0))}</b>}
        />
        {payment.note && <Info label="Ghi chú" value={payment.note} />}
      </div>
    </>
  );
}

function Signatures() {
  return (
    <div className="mt-10 grid grid-cols-2 text-center">
      <div>
        <div className="font-semibold">Khách hàng</div>
        <div className="text-xs italic text-slate-500">(Ký, ghi rõ họ tên)</div>
      </div>
      <div>
        <div className="font-semibold">Người lập phiếu</div>
        <div className="text-xs italic text-slate-500">(Ký, ghi rõ họ tên)</div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <span className="text-slate-600">{label}: </span>
      <span>{value}</span>
    </div>
  );
}

function Total({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-600">{label}</span>
      <span>{value}</span>
    </div>
  );
}
