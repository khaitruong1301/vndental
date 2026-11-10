'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { NOTIFICATIONS_CHANGED } from '@/components/AppShell';
import { AsyncBoundary, Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';

interface NotificationRow {
  id: number;
  notification_type: string;
  title: string;
  content: string | null;
  ref_table: string | null;
  ref_id: number | null;
  is_read: boolean;
  read_at: string | null;
  read_by_name: string | null;
  created_at: string;
}

export default function NotificationsPage() {
  const { can } = useAuth();
  const { data, loading, error, reload } = useApi<NotificationRow[]>('/notifications');
  const { run, busy } = useAction();

  async function markRead(id: number) {
    if (await run(() => api.post(`/notifications/${id}/read`))) {
      reload();
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
    }
  }

  return (
    <>
      <PageHeader title="Thông báo" subtitle="Cảnh báo vật tư/thuốc dưới ngưỡng tồn kho (DT-07) và các thông báo khác" />
      <AsyncBoundary loading={loading && !data} error={error}>
        {!data?.length ? (
          <EmptyState title="Không có thông báo" />
        ) : (
          <div className="space-y-3">
            {data.map((n) => (
              <Card key={n.id} className={n.is_read ? 'opacity-70' : 'border-amber-300'}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {!n.is_read && <Badge color="red">Mới</Badge>}
                      {n.notification_type === 'LOW_STOCK' && <Badge color="yellow">Tồn kho</Badge>}
                      <span className="font-medium text-slate-900">{n.title}</span>
                    </div>
                    {n.content && <p className="mt-1 text-sm text-slate-600">{n.content}</p>}
                    <p className="mt-1 text-xs text-slate-500">
                      {fmtDateTime(n.created_at)}
                      {n.is_read && n.read_by_name && ` · Đã xem bởi ${n.read_by_name} lúc ${fmtDateTime(n.read_at)}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {n.ref_table === 'items' && can('QT-04') && (
                      <Link href="/admin/inventory">
                        <Button variant="secondary" size="sm">
                          Mở kho
                        </Button>
                      </Link>
                    )}
                    {!n.is_read && (
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => markRead(n.id)}>
                        <Check className="h-3.5 w-3.5" /> Đánh dấu đã xem
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </AsyncBoundary>
    </>
  );
}
