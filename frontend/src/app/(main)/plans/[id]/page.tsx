'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2, FilePlus2, Pencil, Receipt, XCircle } from 'lucide-react';
import { InstallmentsEditor, installmentsPayload, installmentsValid } from '@/components/treatments/InstallmentsEditor';
import { ProgressBar } from '@/components/treatments/ProgressBar';
import { type InstallmentDraft, newKey } from '@/components/treatments/types';
import {
  AsyncBoundary,
  Badge,
  Button,
  Card,
  DataTable,
  DescriptionList,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
} from '@/components/ui';
import { api } from '@/lib/api';
import { RequirePerm, useAuth, useLookups } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtMoney, todayStr } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';
import { INVOICE_STATUS, labelOf, PLAN_STATUS, PLAN_TYPE, RECORD_STATUS } from '@/lib/labels';

interface PlanDetail {
  plan: {
    id: number;
    plan_code: string;
    name: string;
    plan_type: string;
    status: string;
    total_price: number;
    expected_sessions: number;
    started_on: string;
    ended_on: string | null;
    note: string | null;
    patient_id: number;
    patient_code: string;
    patient_name: string;
    date_of_birth: string | null;
    phone: string | null;
    primary_doctor_id: number;
    doctor_name: string;
    service_name: string | null;
    created_by_name: string | null;
    completed_sessions: number;
    paid_amount: number;
  };
  installments: { id: number; installment_no: number; due_date: string | null; amount: number; note: string | null; paid_amount: number }[];
  sessions: {
    id: number;
    record_code: string;
    plan_session_no: number | null;
    visit_at: string;
    status: string;
    diagnosis: string | null;
    doctor_name: string;
    work_summary: string | null;
  }[];
  invoice: { id: number; invoice_code: string; status: string; total_amount: number; paid_amount: number; balance_due: number } | null;
}

type ModalKind = 'edit' | 'installments' | 'complete' | 'cancel' | null;

function PlanDetailContent({ id }: { id: string }) {
  const router = useRouter();
  const { can } = useAuth();
  const { doctors } = useLookups();
  const { data, loading, error, reload } = useApi<PlanDetail>(`/plans/${id}`);
  const { run, busy } = useAction();
  const [modal, setModal] = useState<ModalKind>(null);
  const [edit, setEdit] = useState({ name: '', expected_sessions: '', primary_doctor_id: '', note: '' });
  const [schedule, setSchedule] = useState<InstallmentDraft[]>([]);
  const [close, setClose] = useState({ ended_on: todayStr(), note: '' });

  if (!data) return <AsyncBoundary loading={loading} error={error}>{null}</AsyncBoundary>;
  const { plan, installments, sessions, invoice } = data;
  const active = plan.status === 'ACTIVE';
  const canManage = can('DT-05');
  const today = todayStr();

  function openEdit() {
    setEdit({
      name: plan.name,
      expected_sessions: String(plan.expected_sessions),
      primary_doctor_id: String(plan.primary_doctor_id),
      note: plan.note ?? '',
    });
    setModal('edit');
  }

  function openSchedule() {
    setSchedule(
      installments.map((i) => ({
        key: newKey(),
        id: i.id,
        installment_no: i.installment_no,
        due_date: i.due_date ?? '',
        amount: String(i.amount),
        note: i.note ?? '',
        paid_amount: i.paid_amount,
      })),
    );
    setModal('installments');
  }

  async function finish(ok: unknown) {
    if (ok) {
      setModal(null);
      reload();
    }
  }

  async function createInvoice() {
    const res = await run(() => api.post<{ id: number }>('/billing/invoices', { treatment_plan_id: plan.id }), 'Đã lập hóa đơn liệu trình');
    if (res) router.push(`/invoices/${res.id}`);
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {plan.name}
            <StatusBadge label={labelOf(PLAN_STATUS, plan.status)} />
            <StatusBadge label={labelOf(PLAN_TYPE, plan.plan_type)} />
          </span>
        }
        subtitle={`${plan.plan_code} · bắt đầu ${fmtDate(plan.started_on)}${plan.ended_on ? ` · kết thúc ${fmtDate(plan.ended_on)}` : ''}`}
        actions={
          <>
            {canManage && active && (
              <>
                <Button variant="secondary" onClick={openEdit}>
                  <Pencil className="h-4 w-4" /> Sửa
                </Button>
                <Button variant="secondary" onClick={() => setModal('complete')}>
                  <CheckCircle2 className="h-4 w-4" /> Kết thúc
                </Button>
                <Button variant="danger" onClick={() => setModal('cancel')}>
                  <XCircle className="h-4 w-4" /> Hủy
                </Button>
              </>
            )}
            {invoice ? (
              can('TT-01', 'TT-04', 'TT-06') ? (
                <Link href={`/invoices/${invoice.id}`}>
                  <Button variant="secondary">
                    <Receipt className="h-4 w-4" /> Hóa đơn {invoice.invoice_code}
                  </Button>
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                  <Receipt className="h-4 w-4" /> Hóa đơn {invoice.invoice_code}
                </span>
              )
            ) : (
              can('TT-01') &&
              plan.status !== 'CANCELLED' && (
                <Button loading={busy} onClick={createInvoice}>
                  <FilePlus2 className="h-4 w-4" /> Lập hóa đơn liệu trình
                </Button>
              )
            )}
          </>
        }
      />

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card title="Thông tin" className="lg:col-span-2">
            <DescriptionList
              items={[
                {
                  label: 'Bệnh nhân',
                  value: can('BN-05') ? (
                    <Link className="font-medium text-teal-700 hover:underline" href={`/patients/${plan.patient_id}`}>
                      {plan.patient_name} · {plan.patient_code}
                    </Link>
                  ) : (
                    `${plan.patient_name} · ${plan.patient_code}`
                  ),
                },
                { label: 'Bác sĩ phụ trách', value: plan.doctor_name },
                { label: 'Dịch vụ trọn gói', value: plan.service_name ?? '—' },
                { label: 'Tổng giá trọn gói', value: <b>{fmtMoney(plan.total_price)}</b> },
                { label: 'Người tạo', value: plan.created_by_name ?? '—' },
                { label: 'Ghi chú', value: <span className="whitespace-pre-line">{plan.note ?? '—'}</span> },
              ]}
            />
          </Card>
          <Card title="Tiến độ">
            <div className="space-y-4">
              <div>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-slate-600">Số buổi</span>
                  <b>
                    {plan.completed_sessions}/{plan.expected_sessions}
                  </b>
                </div>
                <ProgressBar value={plan.completed_sessions} max={plan.expected_sessions} />
                <div className="mt-1 text-xs text-slate-500">
                  Còn {Math.max(plan.expected_sessions - plan.completed_sessions, 0)} buổi
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-slate-600">Đã thanh toán</span>
                  <b>{fmtMoney(plan.paid_amount)}</b>
                </div>
                <ProgressBar value={plan.paid_amount} max={plan.total_price} tone="emerald" />
                <div className="mt-1 text-xs text-slate-500">Còn lại {fmtMoney(plan.total_price - plan.paid_amount)}</div>
              </div>
              {invoice && (
                <div className="text-sm">
                  Hóa đơn {invoice.invoice_code} <StatusBadge label={labelOf(INVOICE_STATUS, invoice.status)} />
                </div>
              )}
            </div>
          </Card>
        </div>

        <Card
          title="Các đợt thanh toán"
          actions={
            canManage &&
            plan.status !== 'CANCELLED' && (
              <Button variant="secondary" size="sm" onClick={openSchedule}>
                <Pencil className="h-3.5 w-3.5" /> Sửa kế hoạch
              </Button>
            )
          }
          bodyClassName="p-0"
        >
          <DataTable
            rows={installments}
            rowKey={(r) => r.id}
            empty="Chưa có kế hoạch thanh toán"
            columns={[
              { key: 'no', header: 'Đợt', render: (r) => <b>{r.installment_no}</b> },
              { key: 'due', header: 'Hạn', render: (r) => fmtDate(r.due_date) },
              { key: 'amount', header: 'Số tiền', align: 'right', render: (r) => fmtMoney(r.amount) },
              { key: 'paid', header: 'Đã thu', align: 'right', render: (r) => fmtMoney(r.paid_amount) },
              {
                key: 'state',
                header: 'Tình trạng',
                render: (r) =>
                  r.paid_amount >= r.amount ? (
                    <Badge color="green">Đã thu đủ</Badge>
                  ) : r.paid_amount > 0 ? (
                    <Badge color="yellow">Thu một phần</Badge>
                  ) : r.due_date && r.due_date < today ? (
                    <Badge color="red">Quá hạn</Badge>
                  ) : (
                    <Badge>Chưa đến hạn</Badge>
                  ),
              },
              { key: 'note', header: 'Ghi chú', render: (r) => r.note ?? '—' },
            ]}
          />
        </Card>

        <Card title={`Các buổi điều trị (${sessions.length})`} bodyClassName="p-0">
          <DataTable
            rows={sessions}
            rowKey={(r) => r.id}
            onRowClick={(r) => router.push(`/treatments/${r.id}`)}
            empty="Chưa có buổi điều trị nào gắn vào liệu trình"
            columns={[
              { key: 'no', header: 'Buổi', render: (r) => <b>{r.plan_session_no ?? '—'}</b> },
              { key: 'date', header: 'Ngày khám', render: (r) => fmtDateTime(r.visit_at) },
              { key: 'code', header: 'Phiếu', render: (r) => r.record_code },
              { key: 'work', header: 'Công việc', render: (r) => r.work_summary ?? '—' },
              { key: 'doctor', header: 'Bác sĩ', render: (r) => r.doctor_name },
              { key: 'status', header: 'Trạng thái', render: (r) => <StatusBadge label={labelOf(RECORD_STATUS, r.status)} /> },
            ]}
          />
        </Card>
      </div>

      <Modal
        open={modal === 'edit'}
        onClose={() => setModal(null)}
        title="Sửa liệu trình"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>
              Hủy
            </Button>
            <Button
              loading={busy}
              disabled={!edit.name.trim() || !(Number(edit.expected_sessions) > 0)}
              onClick={async () =>
                finish(
                  await run(
                    () =>
                      api.put(`/plans/${plan.id}`, {
                        name: edit.name,
                        expected_sessions: Number(edit.expected_sessions),
                        primary_doctor_id: Number(edit.primary_doctor_id),
                        note: edit.note,
                      }),
                    'Đã cập nhật liệu trình',
                  ),
                )
              }
            >
              Lưu
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Tên liệu trình" required>
            <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          </Field>
          <Field label="Số buổi dự kiến" required hint={`Đã thực hiện ${plan.completed_sessions} buổi`}>
            <Input type="number" min={1} value={edit.expected_sessions} onChange={(e) => setEdit({ ...edit, expected_sessions: e.target.value })} />
          </Field>
          <Field label="Bác sĩ phụ trách">
            <Select value={edit.primary_doctor_id} onChange={(e) => setEdit({ ...edit, primary_doctor_id: e.target.value })}>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ghi chú">
            <Textarea value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={modal === 'installments'}
        onClose={() => setModal(null)}
        title="Kế hoạch các đợt thanh toán"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>
              Hủy
            </Button>
            <Button
              loading={busy}
              disabled={!installmentsValid(schedule, plan.total_price)}
              onClick={async () =>
                finish(
                  await run(
                    () => api.put(`/plans/${plan.id}/installments`, { installments: installmentsPayload(schedule) }),
                    'Đã cập nhật kế hoạch thanh toán',
                  ),
                )
              }
            >
              Lưu kế hoạch
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-500">Đợt đã có lần thu không được xóa hay đổi số tiền.</p>
        <InstallmentsEditor value={schedule} onChange={setSchedule} totalPrice={plan.total_price} />
      </Modal>

      <Modal
        open={modal === 'complete' || modal === 'cancel'}
        onClose={() => setModal(null)}
        title={modal === 'cancel' ? 'Hủy liệu trình' : 'Kết thúc liệu trình'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>
              Đóng
            </Button>
            <Button
              variant={modal === 'cancel' ? 'danger' : 'primary'}
              loading={busy}
              disabled={modal === 'cancel' && !close.note.trim()}
              onClick={async () =>
                finish(
                  await run(
                    () => api.post(`/plans/${plan.id}/${modal === 'cancel' ? 'cancel' : 'complete'}`, close),
                    modal === 'cancel' ? 'Đã hủy liệu trình' : 'Đã kết thúc liệu trình',
                  ),
                )
              }
            >
              Xác nhận
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {modal === 'complete' && plan.completed_sessions < plan.expected_sessions && (
            <p className="text-sm text-amber-700">
              Mới thực hiện {plan.completed_sessions}/{plan.expected_sessions} buổi.
            </p>
          )}
          <Field label="Ngày kết thúc">
            <Input type="date" value={close.ended_on} onChange={(e) => setClose({ ...close, ended_on: e.target.value })} />
          </Field>
          <Field label={modal === 'cancel' ? 'Lý do hủy' : 'Ghi chú'} required={modal === 'cancel'}>
            <Textarea value={close.note} onChange={(e) => setClose({ ...close, note: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </>
  );
}

export default function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequirePerm perms={['DT-05', 'DT-02', 'TT-01', 'BN-05']}>
      <PlanDetailContent id={id} />
    </RequirePerm>
  );
}
