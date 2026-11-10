'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CalendarPlus, CheckCircle2, Receipt, Save } from 'lucide-react';
import {
  Alert,
  AsyncBoundary,
  Button,
  Card,
  DescriptionList,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Tabs,
  Textarea,
} from '@/components/ui';
import { HistoryTimeline } from '@/components/treatments/HistoryTimeline';
import { ItemsEditor, type ItemDraft } from '@/components/treatments/ItemsEditor';
import { MaterialsCard, type MaterialPayload } from '@/components/treatments/MaterialsCard';
import { PrescriptionsEditor, type RxDraft } from '@/components/treatments/PrescriptionsEditor';
import { type AuditEntry, newKey, type RecordDetail } from '@/components/treatments/types';
import { api } from '@/lib/api';
import { RequirePerm, useAuth } from '@/lib/auth';
import { ageOf, fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';
import { GENDER, INVOICE_STATUS, labelOf, RECORD_STATUS } from '@/lib/labels';

interface FormState {
  chief_complaint: string;
  diagnosis: string;
  note: string;
  treatment_plan_id: number | null;
  plan_session_no: string;
  items: ItemDraft[];
  prescriptions: RxDraft[];
}

type PendingAction = { kind: 'save'; complete: boolean } | { kind: 'materials'; rows: MaterialPayload[] };

function toForm(d: RecordDetail): FormState {
  return {
    chief_complaint: d.record.chief_complaint ?? '',
    diagnosis: d.record.diagnosis ?? '',
    note: d.record.note ?? '',
    treatment_plan_id: d.record.treatment_plan_id,
    plan_session_no: d.record.plan_session_no ? String(d.record.plan_session_no) : '',
    items: d.items.map((i) => ({
      key: newKey(),
      id: i.id,
      service_id: i.service_id,
      tooth_code: i.tooth_code,
      performing_doctor_id: i.performing_doctor_id,
      quantity: String(i.quantity),
      is_plan_package: i.is_plan_package,
      note: i.note ?? '',
    })),
    prescriptions: d.prescriptions.map((p) => ({
      key: newKey(),
      id: p.id,
      item_id: p.item_id,
      medicine_name: p.medicine_name,
      dosage: p.dosage,
      quantity: String(p.quantity),
      unit: p.unit ?? '',
      is_external: p.is_external,
      note: p.note ?? '',
    })),
  };
}

function validate(form: FormState): string | null {
  for (const [i, it] of form.items.entries()) {
    if (!it.service_id) return `Dòng ${i + 1}: chưa chọn dịch vụ`;
    if (!it.tooth_code) return `Dòng ${i + 1}: chưa chọn số răng / hàm`;
    if (!(Number(it.quantity) > 0)) return `Dòng ${i + 1}: số lượng phải lớn hơn 0`;
  }
  for (const [i, p] of form.prescriptions.entries()) {
    if (!p.is_external && !p.item_id) return `Đơn thuốc dòng ${i + 1}: chưa chọn thuốc trong kho`;
    if (!p.medicine_name.trim()) return `Đơn thuốc dòng ${i + 1}: chưa nhập tên thuốc`;
    if (!p.dosage.trim()) return `Đơn thuốc dòng ${i + 1}: chưa nhập liều dùng`;
    if (!(Number(p.quantity) > 0)) return `Đơn thuốc dòng ${i + 1}: số lượng phải lớn hơn 0`;
  }
  return null;
}

function RecordEditor({ id }: { id: string }) {
  const { can, reloadLookups } = useAuth();
  const { data, loading, error, reload } = useApi<RecordDetail>(`/treatments/${id}`);
  const [tab, setTab] = useState<'record' | 'history'>('record');
  const history = useApi<AuditEntry[]>(tab === 'history' ? `/treatments/${id}/history` : null);
  const [form, setForm] = useState<FormState | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const { run, busy } = useAction();

  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  if (!data || !form) return <AsyncBoundary loading={loading} error={error}>{null}</AsyncBoundary>;

  const { record, patient, invoice } = data;
  const isDraft = record.status === 'DRAFT';
  const locked = record.status === 'INVOICED' || record.status === 'CANCELLED';
  const editable = !locked && (isDraft ? can('DT-02') : can('DT-08'));
  const canPrescribe = editable && can('DT-03');
  const canLinkPlan = editable && can('DT-04');
  const canViewInvoice = can('TT-01', 'TT-04', 'TT-06');
  const linkedPlan = data.active_plans.find((p) => p.id === form.treatment_plan_id) ?? null;
  const age = ageOf(patient.date_of_birth);

  function choosePlan(planId: number | null) {
    const plan = data!.active_plans.find((p) => p.id === planId) ?? null;
    setForm((f) =>
      f && {
        ...f,
        treatment_plan_id: planId,
        plan_session_no:
          plan && plan.id === record.treatment_plan_id && record.plan_session_no
            ? String(record.plan_session_no)
            : plan
              ? String((plan.last_session_no ?? 0) + 1)
              : '',
        items: f.items.map((it) => ({ ...it, is_plan_package: !!plan && it.service_id !== null && it.service_id === plan.service_id })),
      },
    );
  }

  async function doSave(complete: boolean, changeReason?: string) {
    const payload = {
      chief_complaint: form!.chief_complaint,
      diagnosis: form!.diagnosis,
      note: form!.note,
      treatment_plan_id: form!.treatment_plan_id,
      plan_session_no: form!.treatment_plan_id && form!.plan_session_no ? Number(form!.plan_session_no) : null,
      items: form!.items.map((it) => ({
        id: it.id ?? null,
        service_id: it.service_id,
        tooth_code: it.tooth_code,
        performing_doctor_id: it.performing_doctor_id,
        quantity: Number(it.quantity),
        is_plan_package: it.is_plan_package,
        note: it.note,
      })),
      prescriptions: form!.prescriptions.map((p) => ({
        id: p.id ?? null,
        item_id: p.item_id,
        medicine_name: p.medicine_name,
        dosage: p.dosage,
        quantity: Number(p.quantity),
        unit: p.unit,
        is_external: p.is_external,
        note: p.note,
      })),
      change_reason: changeReason ?? null,
    };
    const ok = await run(async () => {
      await api.put(`/treatments/${id}`, payload);
      if (complete) await api.post(`/treatments/${id}/complete`);
      return true;
    }, complete ? 'Đã hoàn tất khám — phiếu chuyển sang Chờ thanh toán' : 'Đã lưu phiếu điều trị');
    if (ok) {
      setPending(null);
      setReason('');
      reload();
      // Tồn kho thuốc/vật tư vừa thay đổi → làm mới danh mục để kiểm tra «Vượt tồn kho» đúng số mới
      reloadLookups().catch(() => undefined);
    }
  }

  async function doSaveMaterials(rows: MaterialPayload[], changeReason?: string) {
    const ok = await run(
      () => api.put(`/treatments/${id}/materials`, { materials: rows, change_reason: changeReason ?? null }),
      'Đã cập nhật vật tư',
    );
    if (ok) {
      setPending(null);
      setReason('');
      reload();
      // Tồn kho thuốc/vật tư vừa thay đổi → làm mới danh mục để kiểm tra «Vượt tồn kho» đúng số mới
      reloadLookups().catch(() => undefined);
    }
  }

  function requestSave(complete: boolean) {
    const err = validate(form!);
    setFormError(err);
    if (err) return;
    if (complete && form!.items.length === 0) {
      setFormError('Phiếu phải có ít nhất một dòng dịch vụ trước khi hoàn tất khám');
      return;
    }
    if (isDraft) doSave(complete);
    else setPending({ kind: 'save', complete: false });
  }

  function requestMaterials(rows: MaterialPayload[]) {
    if (isDraft) doSaveMaterials(rows);
    else setPending({ kind: 'materials', rows });
  }

  function confirmReason() {
    if (!pending) return;
    if (pending.kind === 'save') doSave(false, reason.trim());
    else doSaveMaterials(pending.rows, reason.trim());
  }

  const followUpHref = `/appointments/new?patient_id=${patient.id}&doctor_id=${record.primary_doctor_id}${
    linkedPlan?.service_id ? `&service_id=${linkedPlan.service_id}` : ''
  }`;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Phiếu điều trị {record.record_code}
            <StatusBadge label={labelOf(RECORD_STATUS, record.status)} />
          </span>
        }
        subtitle={`Khám lúc ${fmtDateTime(record.visit_at)} · BS chính ${record.primary_doctor_name}${record.chair_name ? ` · ${record.chair_name}` : ''}`}
        actions={
          <>
            {can('LH-02') && (
              <Link href={followUpHref}>
                <Button variant="secondary">
                  <CalendarPlus className="h-4 w-4" /> Hẹn tái khám
                </Button>
              </Link>
            )}
            {editable && tab === 'record' && (
              <Button variant={isDraft ? 'secondary' : 'primary'} loading={busy} onClick={() => requestSave(false)}>
                <Save className="h-4 w-4" /> {isDraft ? 'Lưu nháp' : 'Lưu thay đổi'}
              </Button>
            )}
            {editable && isDraft && tab === 'record' && (
              <Button loading={busy} onClick={() => requestSave(true)}>
                <CheckCircle2 className="h-4 w-4" /> Hoàn tất khám → Chờ thanh toán
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 space-y-3">
        {patient.medical_history && (
          <Alert kind="error" title="Lưu ý tiền sử / dị ứng">
            {patient.medical_history}
          </Alert>
        )}
        {record.status === 'INVOICED' && invoice && (
          <Alert kind="info" title="Phiếu đã lập hóa đơn — chỉ xem">
            Hóa đơn{' '}
            {canViewInvoice ? (
              <Link className="font-medium underline" href={`/invoices/${invoice.id}`}>
                {invoice.invoice_code}
              </Link>
            ) : (
              <span className="font-medium">{invoice.invoice_code}</span>
            )}{' '}
            · {labelOf(INVOICE_STATUS, invoice.status).label} · tổng {fmtMoney(invoice.total_amount)}. Muốn sửa phiếu cần Quản lý hủy hóa đơn
            trước (TT-08).
          </Alert>
        )}
        {record.status === 'PENDING_PAYMENT' && editable && (
          <Alert kind="warning">Phiếu đã hoàn tất khám — mọi chỉnh sửa phải ghi lý do và được lưu vào lịch sử (DT-08, DT-09).</Alert>
        )}
        {!editable && !locked && <Alert kind="info">Bạn chỉ có quyền xem phiếu này.</Alert>}
        {formError && <Alert kind="error">{formError}</Alert>}
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'record', label: 'Phiếu điều trị' },
          { key: 'history', label: 'Lịch sử chỉnh sửa' },
        ]}
      />

      {tab === 'history' ? (
        <Card>
          <AsyncBoundary loading={history.loading && !history.data} error={history.error}>
            <HistoryTimeline entries={history.data ?? []} />
          </AsyncBoundary>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card title="Bệnh nhân">
              <DescriptionList
                items={[
                  {
                    label: 'Họ tên',
                    value: can('BN-05') ? (
                      <Link className="font-medium text-teal-700 hover:underline" href={`/patients/${patient.id}`}>
                        {patient.full_name}
                      </Link>
                    ) : (
                      patient.full_name
                    ),
                  },
                  { label: 'Mã BN', value: patient.patient_code },
                  { label: 'Ngày sinh', value: `${fmtDate(patient.date_of_birth)}${age !== null ? ` (${age} tuổi)` : ''}` },
                  { label: 'Giới tính', value: patient.gender ? labelOf(GENDER, patient.gender).label : '—' },
                  { label: 'SĐT', value: patient.phone ?? '—' },
                ]}
              />
            </Card>
            <Card title="Khám & chẩn đoán" className="lg:col-span-2">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Lý do khám">
                  <Textarea rows={2} disabled={!editable} value={form.chief_complaint} onChange={(e) => setForm({ ...form, chief_complaint: e.target.value })} />
                </Field>
                <Field label="Chẩn đoán">
                  <Textarea rows={2} disabled={!editable} value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} />
                </Field>
                <Field label="Ghi chú" className="md:col-span-2">
                  <Input disabled={!editable} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </Field>
              </div>
            </Card>
          </div>

          <Card title="Liệu trình (gắn buổi vào liệu trình)">
            {data.active_plans.length === 0 ? (
              <p className="text-sm text-slate-500">
                Bệnh nhân không có liệu trình đang điều trị.
                {can('DT-05') && (
                  <>
                    {' '}
                    <Link className="text-teal-700 hover:underline" href={`/plans/new?patient_id=${patient.id}`}>
                      Tạo liệu trình mới
                    </Link>
                  </>
                )}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label="Liệu trình" className="md:col-span-2">
                  <Select
                    disabled={!canLinkPlan}
                    value={form.treatment_plan_id ?? ''}
                    onChange={(e) => choosePlan(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">— Không thuộc liệu trình —</option>
                    {data.active_plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.plan_code} · {p.name} ({p.completed_sessions}/{p.expected_sessions} buổi)
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Buổi thứ" hint="Để trống: hệ thống tự lấy buổi kế tiếp">
                  <Input
                    type="number"
                    min={1}
                    disabled={!canLinkPlan || !form.treatment_plan_id}
                    value={form.plan_session_no}
                    onChange={(e) => setForm({ ...form, plan_session_no: e.target.value })}
                  />
                </Field>
                {editable && !canLinkPlan && (
                  <p className="text-xs text-slate-500 md:col-span-3">Bạn không có quyền gắn buổi vào liệu trình (DT-04) — chỉ xem.</p>
                )}
                {linkedPlan && (
                  <p className="text-xs text-slate-500 md:col-span-3">
                    Dòng dịch vụ «{linkedPlan.service_name ?? 'của liệu trình'}» được đánh dấu trọn gói → giá 0 trên hóa đơn buổi (tiền đã tính trong
                    hóa đơn liệu trình).{' '}
                    <Link className="text-teal-700 hover:underline" href={`/plans/${linkedPlan.id}`}>
                      Xem liệu trình
                    </Link>
                  </p>
                )}
              </div>
            )}
          </Card>

          <Card title="Dịch vụ đã thực hiện" bodyClassName="p-3">
            <ItemsEditor
              value={form.items}
              onChange={(items) => setForm({ ...form, items })}
              readOnly={!editable}
              primaryDoctorId={record.primary_doctor_id}
              planServiceId={linkedPlan?.service_id ?? null}
              planLinked={!!linkedPlan}
            />
          </Card>

          <Card title="Đơn thuốc" bodyClassName="p-3">
            <PrescriptionsEditor
              value={form.prescriptions}
              onChange={(prescriptions) => setForm({ ...form, prescriptions })}
              readOnly={!canPrescribe}
              saved={data.prescriptions}
            />
            {editable && !canPrescribe && (
              <p className="mt-2 text-xs text-slate-500">Bạn không có quyền kê đơn thuốc (DT-03) — chỉ xem.</p>
            )}
          </Card>

          <MaterialsCard materials={data.materials} readOnly={!editable} busy={busy} onSave={requestMaterials} />

          <p className="text-xs text-slate-500">
            Tạo bởi {record.created_by_name ?? '—'}
            {record.updated_by_name && ` · Cập nhật gần nhất: ${record.updated_by_name} lúc ${fmtDateTime(record.updated_at)}`}
          </p>
          {invoice && record.status !== 'INVOICED' && canViewInvoice && (
            <Link href={`/invoices/${invoice.id}`} className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline">
              <Receipt className="h-4 w-4" /> Hóa đơn {invoice.invoice_code}
            </Link>
          )}
        </div>
      )}

      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        title="Lý do sửa phiếu"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              Hủy
            </Button>
            <Button loading={busy} disabled={!reason.trim()} onClick={confirmReason}>
              Lưu thay đổi
            </Button>
          </>
        }
      >
        <Field label="Lý do" required hint="Lưu vào lịch sử chỉnh sửa: ai sửa, lúc nào, nội dung trước/sau">
          <Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Ghi nhầm số răng 65, đúng là 75" />
        </Field>
      </Modal>
    </>
  );
}

export default function TreatmentRecordPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequirePerm perms={['DT-02', 'TT-01', 'BN-05']}>
      <RecordEditor id={id} />
    </RequirePerm>
  );
}
