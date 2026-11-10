'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { Ban, Banknote, BadgePercent, Printer, Receipt } from 'lucide-react';
import { DiscountModal, PaymentModal, VoidModal } from '@/components/billing/InvoiceModals';
import type { InvoiceDetail } from '@/components/billing/types';
import {
  Alert,
  AsyncBoundary,
  Badge,
  Button,
  Card,
  DataTable,
  DescriptionList,
  PageHeader,
  StatusBadge,
} from '@/components/ui';
import { RequirePerm, useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { INVOICE_STATUS, INVOICE_TYPE, labelOf, PAYMENT_METHOD, SHIFT, toothLabel } from '@/lib/labels';

export default function InvoiceDetailPage() {
  return (
    <RequirePerm perms={['TT-01', 'TT-04', 'TT-06']}>
      <InvoiceDetailView />
    </RequirePerm>
  );
}

function InvoiceDetailView() {
  const { id } = useParams<{ id: string }>();
  const { can, user } = useAuth();
  const { data: inv, loading, error, reload } = useApi<InvoiceDetail>(`/billing/invoices/${id}`);
  const [modal, setModal] = useState<'discount' | 'payment' | 'void' | null>(null);
  const [lastReceipt, setLastReceipt] = useState<{ id: number; receipt_code: string } | null>(null);

  const voided = inv?.status === 'VOIDED';
  // Đã thu tiền: đổi giảm giá là điều chỉnh hóa đơn (TT-08) — chỉ Quản lý (DB cũng chặn)
  const paid = !!inv && inv.paid_amount > 0;
  const canDiscount = can('TT-03') && !voided && (!paid || user.role === 'MANAGER');

  return (
    <AsyncBoundary loading={loading && !inv} error={error}>
      {inv && (
        <>
          <PageHeader
            title={
              <span className="flex flex-wrap items-center gap-2">
                Hóa đơn {inv.invoice_code}
                <StatusBadge label={labelOf(INVOICE_TYPE, inv.invoice_type)} />
                <StatusBadge label={labelOf(INVOICE_STATUS, inv.status)} />
              </span>
            }
            subtitle={`Lập lúc ${fmtDateTime(inv.issued_at)} bởi ${inv.issued_by_name}`}
            actions={
              <>
                {canDiscount && (
                  <Button variant="secondary" onClick={() => setModal('discount')}>
                    <BadgePercent className="h-4 w-4" /> {paid ? 'Điều chỉnh giảm giá' : 'Giảm giá'}
                  </Button>
                )}
                {can('TT-04') && !voided && inv.balance_due > 0 && (
                  <Button onClick={() => setModal('payment')}>
                    <Banknote className="h-4 w-4" /> Thu tiền
                  </Button>
                )}
                {can('TT-05', 'TT-04') && (
                  <Link href={`/invoices/${inv.id}/print`} target="_blank">
                    <Button variant="secondary">
                      <Printer className="h-4 w-4" /> In hóa đơn
                    </Button>
                  </Link>
                )}
                {can('TT-08') && !voided && (
                  <Button variant="danger" onClick={() => setModal('void')}>
                    <Ban className="h-4 w-4" /> Hủy hóa đơn
                  </Button>
                )}
              </>
            }
          />

          {voided && (
            <div className="mb-4">
              <Alert kind="error" title="Hóa đơn đã bị hủy">
                Lý do: {inv.void_reason} — {inv.voided_by_name}, {fmtDateTime(inv.voided_at)}
              </Alert>
            </div>
          )}
          {lastReceipt && (
            <div className="mb-4">
              <Alert kind="success" title={`Đã thu tiền — phiếu thu ${lastReceipt.receipt_code}`}>
                <Link
                  href={`/invoices/${inv.id}/print?payment_id=${lastReceipt.id}`}
                  target="_blank"
                  className="font-medium underline"
                >
                  In biên lai
                </Link>
              </Alert>
            </div>
          )}

          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card title="Thông tin" className="lg:col-span-2">
              <DescriptionList
                items={[
                  {
                    label: 'Bệnh nhân',
                    value: (
                      <Link href={`/patients/${inv.patient_id}`} className="font-medium text-teal-700 hover:underline">
                        {inv.patient_name} · {inv.patient_code}
                      </Link>
                    ),
                  },
                  { label: 'SĐT', value: inv.patient_phone },
                  {
                    label: inv.invoice_type === 'VISIT' ? 'Phiếu điều trị' : 'Liệu trình',
                    value:
                      inv.invoice_type === 'VISIT' ? (
                        <Link href={`/treatments/${inv.treatment_record_id}`} className="text-teal-700 hover:underline">
                          {inv.record_code}
                        </Link>
                      ) : (
                        <Link href={`/plans/${inv.treatment_plan_id}`} className="text-teal-700 hover:underline">
                          {inv.plan_code} — {inv.plan_name}
                        </Link>
                      ),
                  },
                  inv.invoice_type === 'VISIT'
                    ? { label: 'Ngày khám · Bác sĩ chính', value: `${fmtDateTime(inv.visit_at)} · ${inv.record_doctor_name ?? '—'}` }
                    : { label: 'Số đợt thanh toán', value: inv.installments.length },
                  { label: 'Người lập', value: inv.issued_by_name },
                  { label: 'Ghi chú', value: inv.note },
                ]}
              />
            </Card>
            <Card title="Tổng tiền">
              <dl className="space-y-2 text-sm">
                <Row label="Tạm tính" value={fmtMoney(inv.subtotal)} />
                <Row
                  label="Giảm giá"
                  value={inv.discount_amount ? `− ${fmtMoney(inv.discount_amount)}` : '—'}
                  sub={inv.discount_reason ? `${inv.discount_reason} (${inv.discount_by_name ?? ''})` : undefined}
                />
                <Row label="Tổng hóa đơn" value={<b>{fmtMoney(inv.total_amount)}</b>} />
                <Row label="Đã thu" value={fmtMoney(inv.paid_amount)} />
                <div className="border-t border-slate-100 pt-2">
                  <Row
                    label="Còn nợ"
                    value={
                      <span className={voided ? 'text-slate-400' : inv.balance_due > 0 ? 'text-lg font-semibold text-red-600' : 'font-semibold text-emerald-600'}>
                        {voided ? '—' : fmtMoney(inv.balance_due)}
                      </span>
                    }
                  />
                </div>
              </dl>
            </Card>
          </div>

          <Card title="Chi tiết dòng" className="mb-4" bodyClassName="p-0">
            <DataTable
              rows={inv.lines}
              rowKey={(l) => l.id}
              columns={[
                { key: 'no', header: '#', render: (l) => l.line_no },
                {
                  key: 'desc',
                  header: 'Nội dung',
                  render: (l) => (
                    <>
                      {l.description}
                      {l.line_type === 'MEDICINE' && (
                        <span className="ml-1">
                          <Badge color="purple">Thuốc</Badge>
                        </span>
                      )}
                      {l.line_type === 'SERVICE' && l.unit_price === 0 && (
                        <span className="ml-1">
                          <Badge color="teal">Trọn gói liệu trình</Badge>
                        </span>
                      )}
                    </>
                  ),
                },
                { key: 'tooth', header: 'Răng', render: (l) => (l.tooth_code ? toothLabel(l.tooth_code) : '—') },
                { key: 'doctor', header: 'Bác sĩ thực hiện', render: (l) => l.performing_doctor_name ?? '—' },
                { key: 'qty', header: 'SL', align: 'right', render: (l) => fmtNumber(l.quantity) },
                { key: 'price', header: 'Đơn giá', align: 'right', render: (l) => fmtMoney(l.unit_price) },
                {
                  key: 'discount',
                  header: 'Giảm',
                  align: 'right',
                  render: (l) => (l.discount_amount ? `− ${fmtMoney(l.discount_amount)}` : '—'),
                },
                { key: 'total', header: 'Thành tiền', align: 'right', render: (l) => <b>{fmtMoney(l.line_total)}</b> },
              ]}
            />
          </Card>

          {inv.installments.length > 0 && (
            <Card title="Kế hoạch đợt thanh toán liệu trình" className="mb-4" bodyClassName="p-0">
              <DataTable
                rows={inv.installments}
                rowKey={(i) => i.id}
                columns={[
                  { key: 'no', header: 'Đợt', render: (i) => `Đợt ${i.installment_no}` },
                  { key: 'due', header: 'Hạn', render: (i) => fmtDate(i.due_date) },
                  { key: 'amount', header: 'Số tiền', align: 'right', render: (i) => fmtMoney(i.amount) },
                  { key: 'paid', header: 'Đã thu', align: 'right', render: (i) => fmtMoney(i.paid_amount) },
                  {
                    key: 'status',
                    header: 'Trạng thái',
                    render: (i) =>
                      i.paid_amount >= i.amount ? (
                        <Badge color="green">Đã đủ</Badge>
                      ) : i.paid_amount > 0 ? (
                        <Badge color="yellow">Thu một phần</Badge>
                      ) : (
                        <Badge>Chưa thu</Badge>
                      ),
                  },
                  { key: 'note', header: 'Ghi chú', render: (i) => i.note ?? '' },
                ]}
              />
            </Card>
          )}

          <Card title="Các lần thu tiền" className="mb-4" bodyClassName="p-0">
            <DataTable
              rows={inv.payments}
              rowKey={(p) => p.id}
              empty="Chưa có lần thu nào"
              columns={[
                {
                  key: 'code',
                  header: 'Phiếu thu',
                  render: (p) => (
                    <>
                      <div className="font-medium">{p.receipt_code}</div>
                      <div className="text-xs text-slate-500">{fmtDateTime(p.paid_at)}</div>
                    </>
                  ),
                },
                { key: 'amount', header: 'Số tiền', align: 'right', render: (p) => <b>{fmtMoney(p.amount)}</b> },
                {
                  key: 'method',
                  header: 'Phương thức',
                  render: (p) => (
                    <>
                      <StatusBadge label={labelOf(PAYMENT_METHOD, p.method)} />
                      {p.transaction_ref && <div className="mt-0.5 text-xs text-slate-500">{p.transaction_ref}</div>}
                    </>
                  ),
                },
                { key: 'inst', header: 'Đợt', render: (p) => (p.installment_no ? `Đợt ${p.installment_no}` : '—') },
                {
                  key: 'by',
                  header: 'Người thu · Ca',
                  render: (p) => (
                    <>
                      {p.received_by_name}
                      <div className="text-xs text-slate-500">
                        {labelOf(SHIFT, p.shift).label} {fmtDate(p.work_date)}
                      </div>
                    </>
                  ),
                },
                {
                  key: 'closed',
                  header: 'Két',
                  render: (p) => (p.is_closed ? <Badge color="gray">Đã chốt</Badge> : <Badge color="blue">Chưa chốt</Badge>),
                },
                { key: 'note', header: 'Ghi chú', render: (p) => p.note ?? '' },
                {
                  key: 'print',
                  header: '',
                  align: 'right',
                  render: (p) => (
                    <Link href={`/invoices/${inv.id}/print?payment_id=${p.id}`} target="_blank">
                      <Button size="sm" variant="ghost">
                        <Receipt className="h-3.5 w-3.5" /> In biên lai
                      </Button>
                    </Link>
                  ),
                },
              ]}
            />
          </Card>

          {inv.adjustments.length > 0 && (
            <Card title="Lịch sử hủy / điều chỉnh (TT-08)" bodyClassName="p-0">
              <DataTable
                rows={inv.adjustments}
                rowKey={(a) => a.id}
                columns={[
                  { key: 'at', header: 'Thời điểm', render: (a) => fmtDateTime(a.performed_at) },
                  {
                    key: 'type',
                    header: 'Loại',
                    render: (a) => <Badge color={a.adjustment_type === 'VOID' ? 'red' : 'yellow'}>{a.adjustment_type === 'VOID' ? 'Hủy' : 'Điều chỉnh'}</Badge>,
                  },
                  { key: 'reason', header: 'Lý do', render: (a) => a.reason },
                  {
                    key: 'total',
                    header: 'Tổng trước → sau',
                    render: (a) => (
                      <>
                        {fmtMoney(a.old_total)} → {fmtMoney(a.new_total)}
                        {a.adjustment_type === 'ADJUST' && a.detail?.old_discount != null && a.detail?.new_discount != null && (
                          <div className="text-xs text-slate-500">
                            Giảm giá: {fmtMoney(Number(a.detail.old_discount))} → {fmtMoney(Number(a.detail.new_discount))}
                          </div>
                        )}
                      </>
                    ),
                  },
                  { key: 'by', header: 'Người thực hiện', render: (a) => a.performed_by_name },
                ]}
              />
            </Card>
          )}

          <DiscountModal invoice={inv} open={modal === 'discount'} onClose={() => setModal(null)} onDone={reload} />
          <PaymentModal
            invoice={inv}
            open={modal === 'payment'}
            onClose={() => setModal(null)}
            onDone={(p) => {
              setLastReceipt(p);
              reload();
            }}
          />
          <VoidModal invoice={inv} open={modal === 'void'} onClose={() => setModal(null)} onDone={reload} />
        </>
      )}
    </AsyncBoundary>
  );
}

function Row({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-slate-500">{label}</dt>
        <dd className="text-right">{value}</dd>
      </div>
      {sub && <div className="text-right text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
