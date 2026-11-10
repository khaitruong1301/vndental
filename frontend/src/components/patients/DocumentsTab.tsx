'use client';

import { type FormEvent, useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import { useToast } from '@/components/toast';
import { AsyncBoundary, Badge, Button, Card, EmptyState, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';
import { DOCUMENT_TYPE, type PatientDocument } from './types';

// Khớp giới hạn của backend (multer: ALLOWED_MIME, MAX_FILE_SIZE) — chặn sớm, không chờ gửi lên mới báo lỗi
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function fmtSize(bytes: number | null): string {
  if (!bytes) return '';
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

/** BN-06: ảnh scan hồ sơ giấy cũ, X-quang, ảnh chụp đính kèm hồ sơ */
export function DocumentsTab({ patientId }: { patientId: number }) {
  const { can } = useAuth();
  const { data, loading, error, reload } = useApi<PatientDocument[]>(`/patients/${patientId}/documents`);
  const { run, busy } = useAction();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState('LEGACY_SCAN');
  const [description, setDescription] = useState('');
  const [inputKey, setInputKey] = useState(0);
  const [broken, setBroken] = useState<Record<number, boolean>>({});

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (!ALLOWED_MIME.includes(file.type)) {
      toast.error('Chỉ nhận file ảnh (JPG, PNG, WEBP, GIF) hoặc PDF');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`File vượt quá 10MB (${fmtSize(file.size)})`);
      return;
    }
    const form = new FormData();
    form.append('file', file);
    form.append('document_type', type);
    form.append('description', description);
    const ok = await run(() => api.upload(`/patients/${patientId}/documents`, form), 'Đã tải lên tài liệu');
    if (ok) {
      setFile(null);
      setDescription('');
      setInputKey((k) => k + 1);
      reload();
    }
  }

  const fileUrl = (d: PatientDocument) => `/api/patients/${patientId}/documents/${d.id}/file`;

  return (
    <div className="space-y-4">
      {can('BN-06', 'BN-04') && (
        <Card title="Tải lên tài liệu">
          <form onSubmit={upload} className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_2fr_auto] md:items-end">
            <Field label="File (ảnh JPG/PNG/WEBP hoặc PDF, tối đa 10MB)" required>
              <Input
                key={inputKey}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
            <Field label="Loại">
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                {Object.entries(DOCUMENT_TYPE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Mô tả">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="VD: Hồ sơ giấy 2019 — trang 1" />
            </Field>
            <Button type="submit" loading={busy} disabled={!file}>
              <Upload className="h-4 w-4" /> Tải lên
            </Button>
          </form>
        </Card>
      )}

      <AsyncBoundary loading={loading && !data} error={error}>
        {!data?.length ? (
          <EmptyState title="Chưa có tài liệu đính kèm" />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((d) => {
              const t = DOCUMENT_TYPE[d.document_type] ?? DOCUMENT_TYPE.OTHER;
              const isImage = d.mime_type?.startsWith('image/') && !broken[d.id];
              return (
                <a
                  key={d.id}
                  href={fileUrl(d)}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm hover:border-teal-300"
                >
                  <div className="flex h-40 items-center justify-center bg-slate-50">
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={fileUrl(d)}
                        alt={d.file_name}
                        className="h-full w-full object-cover"
                        onError={() => setBroken((b) => ({ ...b, [d.id]: true }))}
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-slate-400">
                        <FileText className="h-10 w-10" />
                        {broken[d.id] && <span className="text-xs">Không tải được file</span>}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 p-3">
                    <div className="flex items-center gap-2">
                      <Badge color={t.color}>{t.label}</Badge>
                      <span className="truncate text-sm font-medium text-slate-800">{d.file_name}</span>
                    </div>
                    {d.description && <p className="text-xs text-slate-600">{d.description}</p>}
                    <p className="text-xs text-slate-500">
                      {fmtDateTime(d.uploaded_at)}
                      {d.uploaded_by_name && ` · ${d.uploaded_by_name}`} {fmtSize(d.file_size) && `· ${fmtSize(d.file_size)}`}
                    </p>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}
