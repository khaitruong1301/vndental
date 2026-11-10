'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { AsyncBoundary, Badge, Card, DataTable, EmptyState, StatusBadge } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber, fmtTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import {
  APPOINTMENT_SOURCE,
  APPOINTMENT_STATUS,
  INVOICE_STATUS,
  INVOICE_TYPE,
  labelOf,
  PAYMENT_METHOD,
  PLAN_STATUS,
  PLAN_TYPE,
  RECORD_STATUS,
  toothLabel,
} from '@/lib/labels';
import type { PatientAppointment, PatientInvoice, PatientPlan, PatientTreatment } from './types';

export function AppointmentsTab({ patientId }: { patientId: number }) {
  const { data, loading, error } = useApi<PatientAppointment[]>(`/patients/${patientId}/appointments`);
  return (
    <AsyncBoundary loading={loading && !data} error={error}>
      <Card bodyClassName="p-0">
        <DataTable
          rows={data}
          rowKey={(r) => r.booking_group_id}
          empty="Chưa có lịch hẹn"
          columns={[
            {
              key: 'time',
              header: 'Thời gian',
              render: (r) => (
                <>
                  <div className="font-medium">{fmtDate(r.start_at)}</div>
                  <div className="text-xs text-slate-500">
                    {fmtTime(r.start_at)}–{fmtTime(r.end_at)} ({r.slots} khung)
                  </div>
                </>
              ),
            },
            { key: 'service', header: 'Dịch vụ dự kiến', render: (r) => r.service_name ?? '—' },
            { key: 'doctor', header: 'Bác sĩ · Ghế', render: (r) => `${r.doctor_name} · ${r.chair_name}` },
            { key: 'source', header: 'Nguồn', render: (r) => <StatusBadge label={labelOf(APPOINTMENT_SOURCE, r.source)} /> },
            {
              key: 'status',
              header: 'Trạng thái',
              render: (r) => (
                <>
                  <StatusBadge label={labelOf(APPOINTMENT_STATUS, r.status)} />
                  {r.cancel_reason && (
                    <div className="mt-1 text-xs text-slate-500">
                      {r.cancel_reason}
                      {r.cancel_note && ` — ${r.cancel_note}`}
                    </div>
                  )}
                </>
              ),
            },
            { key: 'note', header: 'Ghi chú', render: (r) => <span className="text-xs text-slate-600">{r.note ?? ''}</span> },
          ]}
        />
      </Card>
    </AsyncBoundary>
  );
}

/** Quyền mở trang hóa đơn — giống RequirePerm của /invoices/[id] (bác sĩ chỉ xem công nợ, không mở hóa đơn) */
const INVOICE_VIEW_PERMS = ['TT-01', 'TT-04', 'TT-06'];

export function TreatmentsTab({ patientId }: { patientId: number }) {
  const { can } = useAuth();
  const canOpenInvoice = can(...INVOICE_VIEW_PERMS);
  const { data, loading, error } = useApi<PatientTreatment[]>(`/patients/${patientId}/treatments`);
  const [open, setOpen] = useState<number | null>(null);

  return (
    <AsyncBoundary loading={loading && !data} error={error}>
      {!data?.length ? (
        <EmptyState title="Chưa có lịch sử điều trị" />
      ) : (
        <div className="space-y-3">
          {data.map((t) => {
            const expanded = open === t.id;
            return (
              <Card key={t.id} bodyClassName="p-0">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : t.id)}
                  className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                  <span className="font-medium text-slate-900">{fmtDateTime(t.visit_at)}</span>
                  <span className="font-mono text-xs text-slate-500">{t.record_code}</span>
                  <span className="text-sm text-slate-600">BS. {t.primary_doctor_name}</span>
                  {t.plan_code && (
                    <Badge color="purple">
                      {t.plan_code} · buổi {t.plan_session_no ?? '?'}
                    </Badge>
                  )}
                  <span className="ml-auto flex items-center gap-2">
                    <StatusBadge label={labelOf(RECORD_STATUS, t.status)} />
                    {t.invoice_code && <StatusBadge label={{ ...labelOf(INVOICE_STATUS, t.invoice_status), label: `${t.invoice_code}` }} />}
                  </span>
                </button>
                {!expanded && (
                  <div className="px-11 pb-3 text-sm text-slate-600">
                    {t.items.map((i) => `${i.service_name} (${toothLabel(i.tooth_code)})`).join(' · ') || 'Chưa có dòng điều trị'}
                  </div>
                )}
                {expanded && (
                  <div className="space-y-3 border-t border-slate-100 px-4 py-3">
                    {t.diagnosis && (
                      <p className="text-sm">
                        <span className="font-medium">Chẩn đoán:</span> {t.diagnosis}
                      </p>
                    )}
                    <DataTable
                      rows={t.items}
                      rowKey={(i) => i.id}
                      empty="Chưa có dòng điều trị"
                      columns={[
                        { key: 'no', header: '#', render: (i) => i.line_no },
                        { key: 'svc', header: 'Dịch vụ', render: (i) => i.service_name },
                        { key: 'tooth', header: 'Răng', render: (i) => toothLabel(i.tooth_code) },
                        { key: 'qty', header: 'SL', align: 'right', render: (i) => fmtNumber(i.quantity) },
                        { key: 'doc', header: 'BS thực hiện', render: (i) => i.performing_doctor_name },
                        {
                          key: 'pkg',
                          header: '',
                          render: (i) => (
                            <>
                              {i.is_plan_package && <Badge color="purple">Trọn gói liệu trình</Badge>}
                              {i.note && <span className="ml-1 text-xs text-slate-500">{i.note}</span>}
                            </>
                          ),
                        },
                      ]}
                    />
                    {t.prescriptions.length > 0 && (
                      <div>
                        <div className="mb-1 text-sm font-medium">Đơn thuốc</div>
                        <ul className="space-y-1 text-sm text-slate-700">
                          {t.prescriptions.map((p) => (
                            <li key={p.id}>
                              {p.medicine_name} — {fmtNumber(p.quantity)} {p.unit ?? ''} · {p.dosage}{' '}
                              {p.is_external && <Badge color="gray">Mua ngoài</Badge>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="flex gap-3 text-sm">
                      <Link className="text-teal-700 hover:underline" href={`/treatments/${t.id}`}>
                        Mở phiếu điều trị
                      </Link>
                      {t.invoice_id && canOpenInvoice && (
                        <Link className="text-teal-700 hover:underline" href={`/invoices/${t.invoice_id}`}>
                          Mở hóa đơn {t.invoice_code}
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </AsyncBoundary>
  );
}

export function PlansTab({ patientId }: { patientId: number }) {
  const { data, loading, error } = useApi<PatientPlan[]>(`/patients/${patientId}/plans`);
  return (
    <AsyncBoundary loading={loading && !data} error={error}>
      <Card bodyClassName="p-0">
        <DataTable
          rows={data}
          rowKey={(r) => r.id}
          empty="Chưa có liệu trình"
          columns={[
            {
              key: 'name',
              header: 'Liệu trình',
              render: (r) => (
                <Link href={`/plans/${r.id}`} className="hover:underline">
                  <div className="font-medium text-teal-700">{r.name}</div>
                  <div className="font-mono text-xs text-slate-500">{r.plan_code}</div>
                </Link>
              ),
            },
            { key: 'type', header: 'Loại', render: (r) => <StatusBadge label={labelOf(PLAN_TYPE, r.plan_type)} /> },
            { key: 'doctor', header: 'Bác sĩ phụ trách', render: (r) => r.doctor_name },
            { key: 'start', header: 'Bắt đầu', render: (r) => fmtDate(r.started_on) },
            {
              key: 'progress',
              header: 'Số buổi',
              render: (r) => (
                <div className="w-32">
                  <div className="text-xs">
                    {r.completed_sessions}/{r.expected_sessions} buổi
                  </div>
                  <div className="mt-1 h-1.5 rounded bg-slate-100">
                    <div
                      className="h-1.5 rounded bg-teal-500"
                      style={{ width: `${Math.min(100, (100 * r.completed_sessions) / r.expected_sessions)}%` }}
                    />
                  </div>
                </div>
              ),
            },
            {
              key: 'money',
              header: 'Đã thu / Tổng',
              align: 'right',
              render: (r) => (
                <>
                  {fmtMoney(r.paid_amount)}
                  <div className="text-xs text-slate-500">/ {fmtMoney(r.total_price)}</div>
                </>
              ),
            },
            { key: 'status', header: 'Trạng thái', render: (r) => <StatusBadge label={labelOf(PLAN_STATUS, r.status)} /> },
          ]}
        />
      </Card>
    </AsyncBoundary>
  );
}

export function InvoicesTab({ patientId }: { patientId: number }) {
  const { can } = useAuth();
  const canOpenInvoice = can(...INVOICE_VIEW_PERMS);
  const { data, loading, error } = useApi<PatientInvoice[]>(`/patients/${patientId}/invoices`);
  const debt = (data ?? []).filter((i) => i.status !== 'VOIDED').reduce((s, i) => s + Number(i.balance_due), 0);

  return (
    <AsyncBoundary loading={loading && !data} error={error}>
      <Card
        bodyClassName="p-0"
        title="Hóa đơn"
        actions={
          <span className={debt > 0 ? 'text-sm font-semibold text-red-600' : 'text-sm text-emerald-700'}>
            {debt > 0 ? `Còn nợ: ${fmtMoney(debt)}` : 'Không còn nợ'}
          </span>
        }
      >
        <DataTable
          rows={data}
          rowKey={(r) => r.id}
          empty="Chưa có hóa đơn"
          columns={[
            {
              key: 'code',
              header: 'Hóa đơn',
              render: (r) =>
                canOpenInvoice ? (
                  <Link href={`/invoices/${r.id}`} className="hover:underline">
                    <div className="font-mono text-sm text-teal-700">{r.invoice_code}</div>
                    <div className="text-xs text-slate-500">{fmtDateTime(r.issued_at)}</div>
                  </Link>
                ) : (
                  <div>
                    <div className="font-mono text-sm text-slate-800">{r.invoice_code}</div>
                    <div className="text-xs text-slate-500">{fmtDateTime(r.issued_at)}</div>
                  </div>
                ),
            },
            {
              key: 'type',
              header: 'Loại',
              render: (r) => (
                <>
                  <StatusBadge label={labelOf(INVOICE_TYPE, r.invoice_type)} />
                  <div className="mt-0.5 font-mono text-xs text-slate-500">{r.record_code ?? r.plan_code}</div>
                </>
              ),
            },
            { key: 'total', header: 'Tổng tiền', align: 'right', render: (r) => fmtMoney(r.total_amount) },
            { key: 'paid', header: 'Đã thu', align: 'right', render: (r) => fmtMoney(r.paid_amount) },
            {
              key: 'due',
              header: 'Còn nợ',
              align: 'right',
              render: (r) => (
                <span className={r.balance_due > 0 && r.status !== 'VOIDED' ? 'font-medium text-red-600' : ''}>
                  {r.status === 'VOIDED' ? '—' : fmtMoney(r.balance_due)}
                </span>
              ),
            },
            {
              key: 'payments',
              header: 'Các lần thu',
              render: (r) =>
                r.payments.length ? (
                  <ul className="text-xs text-slate-600">
                    {r.payments.map((p) => (
                      <li key={p.id}>
                        {fmtDate(p.paid_at)} · {fmtMoney(p.amount)} · {labelOf(PAYMENT_METHOD, p.method).label}
                      </li>
                    ))}
                  </ul>
                ) : (
                  '—'
                ),
            },
            {
              key: 'status',
              header: 'Trạng thái',
              render: (r) => (
                <>
                  <StatusBadge label={labelOf(INVOICE_STATUS, r.status)} />
                  {r.void_reason && <div className="mt-1 text-xs text-slate-500">{r.void_reason}</div>}
                </>
              ),
            },
          ]}
        />
      </Card>
    </AsyncBoundary>
  );
}
