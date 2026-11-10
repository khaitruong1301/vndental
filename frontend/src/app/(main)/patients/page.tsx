'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, FileArchive, Search, UserPlus } from 'lucide-react';
import type { PatientListResponse } from '@/components/patients/types';
import { Alert, Badge, Button, Card, DataTable, Input, PageHeader, Select, StatusBadge } from '@/components/ui';
import { RequirePerm, useAuth } from '@/lib/auth';
import { ageOf, fmtDate } from '@/lib/format';
import { useApi, useDebounced } from '@/lib/hooks';
import { GENDER, labelOf, PATIENT_STATUS } from '@/lib/labels';

export default function PatientsPage() {
  return (
    <RequirePerm perms={['BN-01']}>
      <PatientList />
    </RequirePerm>
  );
}

/** Từ khóa là SĐT (cho phép dấu cách, chấm, gạch, ngoặc, +84) → trả SĐT đã chuẩn hóa; ngược lại null */
function phoneKeyword(keyword: string): string | null {
  const compact = keyword.trim().replace(/[\s.\-()]/g, '');
  if (!/^\+?\d+$/.test(compact)) return null;
  return compact.replace(/^\+?84(?=\d{9}$)/, '0').replace(/^\+/, '');
}

function PatientList() {
  const { can } = useAuth();
  const router = useRouter();
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(keyword.trim(), 300);
  const { data, loading, error } = useApi<PatientListResponse>('/patients', { q, status, page });
  const phoneQ = phoneKeyword(q);
  const phoneInput = phoneKeyword(keyword);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <>
      <PageHeader
        title="Bệnh nhân"
        subtitle="Tìm theo SĐT (của bệnh nhân hoặc người giám hộ), họ tên hoặc mã bệnh nhân — BN-01"
        actions={
          <>
            {can('BN-06') && (
              <Link href="/patients/new?legacy=1">
                <Button variant="secondary">
                  <FileArchive className="h-4 w-4" /> Số hóa hồ sơ giấy
                </Button>
              </Link>
            )}
            {can('BN-02') && (
              <Link href={`/patients/new${phoneInput ? `?phone=${phoneInput}` : ''}`}>
                <Button>
                  <UserPlus className="h-4 w-4" /> Đăng ký bệnh nhân mới
                </Button>
              </Link>
            )}
          </>
        }
      />

      <Card bodyClassName="p-0">
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              autoFocus
              className="pl-9"
              placeholder="Nhập SĐT, họ tên hoặc mã BN..."
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            className="w-48"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang theo dõi</option>
            <option value="ARCHIVED">Lưu trữ</option>
          </Select>
        </div>

        {error && (
          <div className="p-4">
            <Alert kind="error">{error}</Alert>
          </div>
        )}

        {phoneQ && (data?.total ?? 0) > 1 && (
          <div className="px-4 pt-3">
            <Alert kind="info">
              Có {data?.total} bệnh nhân dùng SĐT bắt đầu bằng {phoneQ}. Chọn đúng người theo họ tên và ngày sinh.
            </Alert>
          </div>
        )}

        <DataTable
          rows={data?.rows}
          loading={loading}
          rowKey={(r) => r.id}
          onRowClick={(r) => router.push(`/patients/${r.id}`)}
          empty={q ? 'Không tìm thấy bệnh nhân phù hợp' : 'Chưa có bệnh nhân'}
          columns={[
            { key: 'code', header: 'Mã BN', render: (r) => <span className="font-mono text-xs">{r.patient_code}</span> },
            {
              key: 'name',
              header: 'Họ và tên',
              render: (r) => (
                <div>
                  <div className="font-medium text-slate-900">{r.full_name}</div>
                  {r.is_legacy && (
                    <div className="mt-0.5">
                      <Badge color="orange">Hồ sơ giấy {r.legacy_record_no ?? ''}</Badge>
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: 'dob',
              header: 'Ngày sinh',
              render: (r) =>
                r.date_of_birth ? (
                  <>
                    {fmtDate(r.date_of_birth)} <span className="text-xs text-slate-500">({ageOf(r.date_of_birth)} tuổi)</span>
                  </>
                ) : (
                  '—'
                ),
            },
            { key: 'gender', header: 'Giới tính', render: (r) => (r.gender ? labelOf(GENDER, r.gender).label : '—') },
            { key: 'phone', header: 'SĐT', render: (r) => r.phone ?? '—' },
            {
              key: 'guardian',
              header: 'Người giám hộ',
              render: (r) =>
                r.guardian_name ? (
                  <span className="text-sm">
                    {r.guardian_name} <span className="text-xs text-slate-500">({r.guardian_relationship})</span>
                  </span>
                ) : (
                  '—'
                ),
            },
            { key: 'last', header: 'Khám gần nhất', render: (r) => fmtDate(r.last_visit_at) },
            { key: 'status', header: 'Trạng thái', render: (r) => <StatusBadge label={labelOf(PATIENT_STATUS, r.status)} /> },
          ]}
        />

        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
            <span>
              {data.total} bệnh nhân · Trang {page}/{totalPages}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" /> Trước
              </Button>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Sau <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
