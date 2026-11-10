'use client';

import { useState } from 'react';
import { CatalogEditor, type FieldDef } from '@/components/admin/CatalogEditor';
import { NormsEditor } from '@/components/admin/NormsEditor';
import { Badge, PageHeader, StatusBadge, Tabs } from '@/components/ui';
import { RequirePerm, useAuth } from '@/lib/auth';
import { fmtNumber } from '@/lib/format';
import { ITEM_TYPE, labelOf, TOOTH_SCOPE } from '@/lib/labels';

type TabKey = 'services' | 'chairs' | 'items' | 'cancel-reasons' | 'norms';

interface ServiceRow {
  id: number;
  code: string;
  name: string;
  category: string | null;
  unit: string;
  tooth_scope: string;
  default_slots: number;
  description: string | null;
  is_active: boolean;
  norm_count: number;
}

interface ChairRow {
  id: number;
  code: string;
  name: string;
  note: string | null;
  is_active: boolean;
  upcoming_appointments: number;
}

interface ItemRow {
  id: number;
  code: string;
  name: string;
  item_type: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  default_dosage: string | null;
  note: string | null;
  is_active: boolean;
  norm_count: number;
}

interface CancelReasonRow {
  id: number;
  code: string;
  name: string;
  is_no_show: boolean;
  sort_order: number;
  is_active: boolean;
}

function codeNameColumn<T extends { code: string; name: string }>(header: string) {
  return {
    key: 'name',
    header,
    render: (r: T) => (
      <>
        <div className="font-medium text-slate-900">{r.name}</div>
        <div className="text-xs text-slate-500">{r.code}</div>
      </>
    ),
  };
}

const SERVICE_FIELDS: FieldDef[] = [
  { name: 'code', label: 'Mã dịch vụ', required: true },
  { name: 'name', label: 'Tên dịch vụ', required: true },
  { name: 'category', label: 'Nhóm', hint: 'vd. Phục hồi, Nha chu, Chỉnh nha' },
  { name: 'unit', label: 'Đơn vị tính', required: true, hint: 'vd. lần, răng, liệu trình' },
  {
    name: 'tooth_scope',
    label: 'Phạm vi ghi trên phiếu',
    type: 'select',
    options: [
      { value: 'TOOTH', label: 'Theo răng (số răng FDI)' },
      { value: 'JAW', label: 'Theo hàm (toàn hàm / hàm trên / hàm dưới)' },
      { value: 'ANY', label: 'Răng hoặc hàm' },
    ],
  },
  { name: 'default_slots', label: 'Số khung 30 phút khi đặt lịch', type: 'number', min: 1, step: 1, required: true },
  { name: 'description', label: 'Mô tả', type: 'textarea' },
];

const CHAIR_FIELDS: FieldDef[] = [
  { name: 'code', label: 'Mã ghế', required: true },
  { name: 'name', label: 'Tên ghế', required: true },
  { name: 'note', label: 'Ghi chú', type: 'textarea' },
];

const ITEM_FIELDS: FieldDef[] = [
  { name: 'code', label: 'Mã', required: true },
  { name: 'name', label: 'Tên vật tư / thuốc', required: true },
  {
    name: 'item_type',
    label: 'Loại',
    type: 'select',
    options: [
      { value: 'SUPPLY', label: 'Vật tư' },
      { value: 'MEDICINE', label: 'Thuốc' },
    ],
  },
  { name: 'unit', label: 'Đơn vị tính', required: true, hint: 'vd. viên, ống, đôi, chai' },
  {
    name: 'min_stock',
    label: 'Ngưỡng tồn tối thiểu',
    type: 'number',
    min: 0,
    step: 0.01,
    required: true,
    hint: 'Tồn kho xuống dưới ngưỡng → cảnh báo Quản lý',
  },
  { name: 'default_dosage', label: 'Liều dùng mặc định (thuốc)', hint: 'Tự điền khi bác sĩ kê đơn' },
  { name: 'note', label: 'Ghi chú', type: 'textarea' },
];

const CANCEL_REASON_FIELDS: FieldDef[] = [
  { name: 'code', label: 'Mã', required: true },
  { name: 'name', label: 'Lý do', required: true },
  { name: 'sort_order', label: 'Thứ tự hiển thị', type: 'number', step: 1 },
  { name: 'is_no_show', label: 'Là trường hợp «Không đến» (thống kê BC-04)', type: 'checkbox' },
];

export default function CatalogPage() {
  return (
    <RequirePerm perms={['QT-03']}>
      <CatalogBoard />
    </RequirePerm>
  );
}

function CatalogBoard() {
  const [tab, setTab] = useState<TabKey>('services');
  const { reloadLookups } = useAuth();
  // Danh mục đổi → làm mới dropdown dùng chung ở các màn hình khác
  const refreshLookups = () => {
    reloadLookups().catch(() => undefined);
  };

  return (
    <>
      <PageHeader title="Danh mục" subtitle="QT-03 · Dịch vụ, ghế, vật tư & thuốc, lý do hủy lịch, định mức vật tư" />
      <Tabs
        tabs={[
          { key: 'services', label: 'Dịch vụ' },
          { key: 'chairs', label: 'Ghế' },
          { key: 'items', label: 'Vật tư & thuốc' },
          { key: 'cancel-reasons', label: 'Lý do hủy lịch' },
          { key: 'norms', label: 'Định mức vật tư' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'services' && (
        <CatalogEditor<ServiceRow>
          key="services"
          path="services"
          entityLabel="dịch vụ"
          fields={SERVICE_FIELDS}
          emptyForm={{ code: '', name: '', category: '', unit: 'lần', tooth_scope: 'TOOTH', default_slots: '1', description: '' }}
          onChanged={refreshLookups}
          columns={[
            codeNameColumn<ServiceRow>('Dịch vụ'),
            { key: 'category', header: 'Nhóm', render: (r) => r.category ?? '—' },
            { key: 'unit', header: 'Đơn vị', render: (r) => r.unit },
            { key: 'scope', header: 'Phạm vi', render: (r) => <StatusBadge label={labelOf(TOOTH_SCOPE, r.tooth_scope)} /> },
            { key: 'slots', header: 'Khung giờ', align: 'center', render: (r) => `${r.default_slots} × 30 phút` },
            {
              key: 'norms',
              header: 'Định mức',
              align: 'center',
              render: (r) => (r.norm_count ? `${r.norm_count} vật tư` : <span className="text-slate-400">—</span>),
            },
          ]}
        />
      )}

      {tab === 'chairs' && (
        <CatalogEditor<ChairRow>
          key="chairs"
          path="chairs"
          entityLabel="ghế"
          fields={CHAIR_FIELDS}
          emptyForm={{ code: '', name: '', note: '' }}
          onChanged={refreshLookups}
          columns={[
            codeNameColumn<ChairRow>('Ghế'),
            { key: 'note', header: 'Ghi chú', render: (r) => r.note ?? '—' },
            {
              key: 'upcoming',
              header: 'Lịch sắp tới',
              align: 'center',
              render: (r) => (r.upcoming_appointments ? <Badge color="blue">{r.upcoming_appointments} khung</Badge> : '—'),
            },
          ]}
        />
      )}

      {tab === 'items' && (
        <CatalogEditor<ItemRow>
          key="items"
          path="items"
          entityLabel="vật tư / thuốc"
          fields={ITEM_FIELDS}
          emptyForm={{ code: '', name: '', item_type: 'SUPPLY', unit: '', min_stock: '0', default_dosage: '', note: '' }}
          onChanged={refreshLookups}
          columns={[
            codeNameColumn<ItemRow>('Vật tư / thuốc'),
            { key: 'type', header: 'Loại', render: (r) => <StatusBadge label={labelOf(ITEM_TYPE, r.item_type)} /> },
            { key: 'unit', header: 'Đơn vị', render: (r) => r.unit },
            {
              key: 'stock',
              header: 'Tồn / ngưỡng',
              align: 'right',
              render: (r) => (
                <span className={r.current_stock <= r.min_stock ? 'font-medium text-red-600' : ''}>
                  {fmtNumber(r.current_stock)} / {fmtNumber(r.min_stock)}
                </span>
              ),
            },
            { key: 'dosage', header: 'Liều mặc định', render: (r) => r.default_dosage ?? '—' },
          ]}
        />
      )}

      {tab === 'cancel-reasons' && (
        <CatalogEditor<CancelReasonRow>
          key="cancel-reasons"
          path="cancel-reasons"
          entityLabel="lý do hủy"
          fields={CANCEL_REASON_FIELDS}
          emptyForm={{ code: '', name: '', sort_order: '0', is_no_show: false }}
          onChanged={refreshLookups}
          columns={[
            codeNameColumn<CancelReasonRow>('Lý do'),
            { key: 'order', header: 'Thứ tự', align: 'center', render: (r) => r.sort_order },
            {
              key: 'noshow',
              header: 'Loại',
              render: (r) => (r.is_no_show ? <Badge color="orange">Không đến</Badge> : <Badge>Hủy thường</Badge>),
            },
          ]}
        />
      )}

      {tab === 'norms' && <NormsEditor onChanged={refreshLookups} />}
    </>
  );
}
