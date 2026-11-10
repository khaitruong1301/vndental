'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { Alert, AsyncBoundary, Button, Card, EmptyState, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction, useApi } from '@/lib/hooks';

interface ServiceOption {
  id: number;
  code: string;
  name: string;
  unit: string;
  category: string | null;
  is_active: boolean;
  norm_count: number;
}

interface ItemOption {
  id: number;
  code: string;
  name: string;
  unit: string;
  item_type: 'SUPPLY' | 'MEDICINE';
  is_active: boolean;
}

interface NormsData {
  service: { id: number; code: string; name: string; unit: string };
  norms: { item_id: number; code: string; name: string; unit: string; is_active: boolean; quantity: number }[];
}

interface Line {
  item_id: string;
  quantity: string;
}

/** Định mức vật tư theo dịch vụ (QT-03) — hệ thống trừ kho theo định mức khi lưu phiếu (DT-06) */
export function NormsEditor({ onChanged }: { onChanged?: () => void }) {
  const services = useApi<ServiceOption[]>('/admin/catalog/services');
  const items = useApi<ItemOption[]>('/admin/catalog/items');
  const [serviceId, setServiceId] = useState('');
  const norms = useApi<NormsData>(serviceId ? `/admin/catalog/services/${serviceId}/norms` : null);
  const [lines, setLines] = useState<Line[]>([]);
  const { run, busy } = useAction();

  const original = useMemo(
    () => norms.data?.norms.map((n) => ({ item_id: String(n.item_id), quantity: String(n.quantity) })) ?? [],
    [norms.data],
  );
  useEffect(() => setLines(original), [original]);

  const supplies = (items.data ?? []).filter((i) => i.item_type === 'SUPPLY' && i.is_active);
  const itemById = new Map((items.data ?? []).map((i) => [String(i.id), i]));
  const dirty = JSON.stringify(lines) !== JSON.stringify(original);
  const usedIds = lines.map((l) => l.item_id).filter(Boolean);
  const duplicate = new Set(usedIds).size !== usedIds.length;
  const invalid = lines.some((l) => !l.item_id || !(Number(l.quantity) > 0));

  const update = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  async function save() {
    const ok = await run(
      () =>
        api.put(`/admin/catalog/services/${serviceId}/norms`, {
          lines: lines.map((l) => ({ item_id: Number(l.item_id), quantity: Number(l.quantity) })),
        }),
      'Đã lưu định mức vật tư',
    );
    if (ok) {
      norms.reload();
      services.reload();
      onChanged?.();
    }
  }

  const service = services.data?.find((s) => String(s.id) === serviceId);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card title="Chọn dịch vụ">
        <AsyncBoundary loading={services.loading && !services.data} error={services.error}>
          <Field label="Dịch vụ">
            <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">— Chọn dịch vụ —</option>
              {services.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code}) · {s.norm_count} vật tư{!s.is_active ? ' · ngừng dùng' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <p className="mt-3 text-xs text-slate-500">
            Định mức tính cho <b>1 đơn vị</b> dịch vụ (vd. 1 răng). Khi bác sĩ lưu phiếu, hệ thống trừ kho = định mức ×
            số lượng; bác sĩ vẫn chỉnh được số thực dùng.
          </p>
        </AsyncBoundary>
      </Card>

      <div className="lg:col-span-2">
        {!serviceId ? (
          <EmptyState title="Chọn một dịch vụ để xem và sửa định mức vật tư" />
        ) : (
          <Card
            title={service ? `Định mức cho 1 ${service.unit} "${service.name}"` : 'Định mức vật tư'}
            actions={
              <>
                <Button variant="ghost" size="sm" disabled={!dirty || busy} onClick={() => setLines(original)}>
                  <RotateCcw className="h-3.5 w-3.5" /> Hoàn tác
                </Button>
                <Button size="sm" loading={busy} disabled={!dirty || invalid || duplicate} onClick={save}>
                  <Save className="h-3.5 w-3.5" /> Lưu định mức
                </Button>
              </>
            }
          >
            <AsyncBoundary loading={norms.loading && !norms.data} error={norms.error}>
              <div className="space-y-2">
                {duplicate && <Alert kind="error">Một vật tư chỉ được khai báo một lần.</Alert>}
                {lines.length === 0 && <p className="text-sm text-slate-500">Dịch vụ này chưa có định mức vật tư.</p>}
                {lines.map((l, i) => {
                  const item = itemById.get(l.item_id);
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <Select className="min-w-60 flex-1" value={l.item_id} onChange={(e) => update(i, { item_id: e.target.value })}>
                        <option value="">— Chọn vật tư —</option>
                        {item && !supplies.includes(item) && (
                          <option value={l.item_id}>
                            {item.name} ({item.code}){!item.is_active ? ' · ngừng dùng' : ''}
                          </option>
                        )}
                        {supplies.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.code})
                          </option>
                        ))}
                      </Select>
                      <Input
                        type="number"
                        min={0}
                        step={0.1}
                        className="w-28"
                        value={l.quantity}
                        onChange={(e) => update(i, { quantity: e.target.value })}
                      />
                      <span className="w-12 text-sm text-slate-500">{item?.unit ?? ''}</span>
                      <Button variant="ghost" size="sm" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  );
                })}
                <Button variant="secondary" size="sm" onClick={() => setLines((ls) => [...ls, { item_id: '', quantity: '1' }])}>
                  <Plus className="h-3.5 w-3.5" /> Thêm vật tư
                </Button>
              </div>
            </AsyncBoundary>
          </Card>
        )}
      </div>
    </div>
  );
}
