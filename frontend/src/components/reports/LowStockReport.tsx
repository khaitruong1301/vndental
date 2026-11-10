'use client';

import Link from 'next/link';
import { AsyncBoundary, Badge, Button, Card, DataTable, StatCard, StatusBadge } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtNumber } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { ITEM_TYPE, labelOf } from '@/lib/labels';
import { CsvButton, downloadCsv, KpiRow, Meter, ReportToolbar } from './common';

interface Row {
  item_id: number;
  code: string;
  name: string;
  item_type: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  shortage: number;
  below_min: boolean;
  last_import_at: string | null;
}

// BC-07: vật tư / thuốc có tồn ≤ ngưỡng tối thiểu
export function LowStockReport() {
  const { can } = useAuth();
  const { data, loading, error } = useApi<{ rows: Row[] }>('/reports/low-stock');
  const rows = data?.rows ?? [];

  function exportCsv() {
    downloadCsv(
      'BC-07_vat-tu-thuoc-sap-het.csv',
      ['Mã', 'Tên', 'Loại', 'Đơn vị', 'Tồn kho', 'Ngưỡng tối thiểu', 'Thiếu so với ngưỡng', 'Nhập gần nhất'],
      rows.map((r) => [
        r.code,
        r.name,
        labelOf(ITEM_TYPE, r.item_type).label,
        r.unit,
        r.current_stock,
        r.min_stock,
        r.shortage,
        fmtDate(r.last_import_at),
      ]),
    );
  }

  return (
    <>
      <ReportToolbar code="BC-07" question="Thuốc hay vật tư nào sắp hết?">
        {can('QT-04') && (
          <Link href="/admin/inventory">
            <Button variant="secondary">Mở kho / nhập hàng</Button>
          </Link>
        )}
        <CsvButton onClick={exportCsv} disabled={!rows.length} />
      </ReportToolbar>
      <AsyncBoundary loading={loading && !data} error={error}>
        <KpiRow>
          <StatCard label="Mặt hàng sắp hết" value={rows.length} tone="yellow" />
          <StatCard label="Dưới ngưỡng tối thiểu" value={rows.filter((r) => r.below_min).length} tone="red" />
          <StatCard label="Vật tư" value={rows.filter((r) => r.item_type === 'SUPPLY').length} tone="teal" />
          <StatCard label="Thuốc" value={rows.filter((r) => r.item_type === 'MEDICINE').length} tone="purple" />
        </KpiRow>
        <Card title="Danh sách cần bổ sung" bodyClassName="p-0">
          <DataTable
            rows={rows}
            rowKey={(r) => r.item_id}
            empty="Không có mặt hàng nào dưới ngưỡng"
            columns={[
              {
                key: 'item',
                header: 'Mặt hàng',
                render: (r) => (
                  <>
                    <div className="font-medium">{r.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                      {r.code} <StatusBadge label={labelOf(ITEM_TYPE, r.item_type)} />
                    </div>
                  </>
                ),
              },
              {
                key: 'stock',
                header: 'Tồn / ngưỡng',
                render: (r) => (
                  <Meter
                    value={r.current_stock}
                    max={r.min_stock}
                    label={`${fmtNumber(r.current_stock)} / ${fmtNumber(r.min_stock)} ${r.unit}`}
                  />
                ),
              },
              {
                key: 'shortage',
                header: 'Thiếu',
                align: 'right',
                render: (r) => `${fmtNumber(r.shortage)} ${r.unit}`,
              },
              {
                key: 'state',
                header: 'Mức',
                render: (r) => (r.below_min ? <Badge color="red">Dưới ngưỡng</Badge> : <Badge color="yellow">Chạm ngưỡng</Badge>),
              },
              { key: 'import', header: 'Nhập gần nhất', render: (r) => fmtDate(r.last_import_at) },
            ]}
          />
        </Card>
      </AsyncBoundary>
    </>
  );
}
