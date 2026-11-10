'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, MessageSquare, PhoneCall, XCircle } from 'lucide-react';
import { CancelModal } from '@/components/appointments/CancelModal';
import { RescheduleModal } from '@/components/appointments/RescheduleModal';
import type { AppointmentGroup, ReminderGroup } from '@/components/appointments/types';
import {
  AsyncBoundary,
  Badge,
  Button,
  Card,
  Checkbox,
  DataTable,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  StatCard,
  Textarea,
} from '@/components/ui';
import { api } from '@/lib/api';
import { RequirePerm, useAuth } from '@/lib/auth';
import { addDays, ageOf, fmtDate, fmtDateTime, todayStr, weekdayOf } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';
import { labelOf, REMINDER_CHANNEL, REMINDER_RESULT } from '@/lib/labels';

const CALL_RESULTS = ['CONFIRMED', 'NO_ANSWER', 'WRONG_NUMBER', 'RESCHEDULE_REQUESTED', 'CANCEL_REQUESTED'];
const CLINIC_NAME = 'Nha khoa Nụ Cười Việt';

function stripAccents(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function messageTemplate(g: ReminderGroup, unaccented: boolean): string {
  const age = ageOf(g.date_of_birth);
  const who = age !== null && age < 15 ? `bé ${g.patient_name}` : `Quý khách ${g.patient_name}`;
  const text =
    `${CLINIC_NAME} nhắc lịch: ${who} có hẹn lúc ${g.start_time} ngày ${fmtDate(g.date)} với BS ${g.doctor_name}` +
    `${g.service_name ? ` (${g.service_name})` : ''}. Vui lòng liên hệ quầy lễ tân nếu cần đổi lịch. Xin cảm ơn!`;
  return unaccented ? stripAccents(text) : text;
}

/** Danh sách số có thể liên hệ: SĐT bệnh nhân + người giám hộ */
function phonesOf(g: ReminderGroup): { phone: string; label: string }[] {
  const list: { phone: string; label: string }[] = [];
  if (g.patient_phone) list.push({ phone: g.patient_phone, label: `${g.patient_phone} (bệnh nhân)` });
  if (g.guardian_phone && g.guardian_phone !== g.patient_phone) {
    list.push({ phone: g.guardian_phone, label: `${g.guardian_phone} (${g.guardian_relationship} ${g.guardian_name})` });
  }
  return list;
}

/* ---------------------------- LH-05: ghi kết quả gọi ---------------------------- */

function CallResultModal({ group, onClose, onDone }: { group: ReminderGroup | null; onClose: () => void; onDone: () => void }) {
  const [result, setResult] = useState('CONFIRMED');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const { run, busy } = useAction();

  useEffect(() => {
    if (!group) return;
    setResult('CONFIRMED');
    setPhone(phonesOf(group)[0]?.phone ?? '');
    setNote('');
  }, [group]);

  async function submit() {
    if (!group) return;
    const ok = await run(
      () =>
        api.post(`/appointments/groups/${group.booking_group_id}/reminders`, {
          result,
          recipient_phone: phone,
          note,
        }),
      'Đã ghi kết quả gọi nhắc lịch',
    );
    if (ok) onDone();
  }

  return (
    <Modal
      open={!!group}
      onClose={onClose}
      title="Ghi kết quả gọi nhắc lịch"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
          <Button loading={busy} onClick={submit}>
            Lưu kết quả
          </Button>
        </>
      }
    >
      {group && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {group.patient_name} · {group.start_time} {fmtDate(group.date)} · BS {group.doctor_name}
          </p>
          <Field label="Số đã gọi">
            <Select value={phone} onChange={(e) => setPhone(e.target.value)}>
              {phonesOf(group).map((p) => (
                <option key={p.phone} value={p.phone}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kết quả" required>
            <Select value={result} onChange={(e) => setResult(e.target.value)}>
              {CALL_RESULTS.map((r) => (
                <option key={r} value={r}>
                  {labelOf(REMINDER_RESULT, r).label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ghi chú">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {result === 'NO_ANSWER' && (
            <p className="text-xs text-amber-700">Khách không nghe máy → nên gửi tin nhắn nhắc lịch (LH-06).</p>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ---------------------------- LH-06: gửi SMS / Zalo ---------------------------- */

function MessageModal({ group, onClose, onDone }: { group: ReminderGroup | null; onClose: () => void; onDone: () => void }) {
  const [channel, setChannel] = useState<'SMS' | 'ZALO'>('SMS');
  const [unaccented, setUnaccented] = useState(true);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const { run, busy } = useAction();

  useEffect(() => {
    if (!group) return;
    setChannel('SMS');
    setUnaccented(true);
    setPhone(phonesOf(group)[0]?.phone ?? '');
    setMessage(messageTemplate(group, true));
  }, [group]);

  function changeTemplate(nextChannel: 'SMS' | 'ZALO', nextUnaccented: boolean) {
    setChannel(nextChannel);
    setUnaccented(nextUnaccented);
    if (group) setMessage(messageTemplate(group, nextUnaccented));
  }

  async function submit() {
    if (!group) return;
    const ok = await run(
      () =>
        api.post(`/appointments/groups/${group.booking_group_id}/send-message`, {
          channel,
          message,
          recipient_phone: phone,
        }),
      `Đã gửi tin ${channel === 'SMS' ? 'SMS' : 'Zalo'} nhắc lịch`,
    );
    if (ok) onDone();
  }

  return (
    <Modal
      open={!!group}
      onClose={onClose}
      title="Gửi tin nhắn nhắc lịch"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
          <Button loading={busy} disabled={!message.trim() || !phone} onClick={submit}>
            <MessageSquare className="h-4 w-4" /> Gửi tin
          </Button>
        </>
      }
    >
      {group && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kênh">
              <Select
                value={channel}
                onChange={(e) => {
                  const next = e.target.value as 'SMS' | 'ZALO';
                  changeTemplate(next, next === 'SMS');
                }}
              >
                <option value="SMS">SMS</option>
                <option value="ZALO">Zalo</option>
              </Select>
            </Field>
            <Field label="Gửi tới">
              <Select value={phone} onChange={(e) => setPhone(e.target.value)}>
                {phonesOf(group).map((p) => (
                  <option key={p.phone} value={p.phone}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Checkbox
            label="Không dấu (tránh lỗi hiển thị / tính phí 2 tin với SMS)"
            checked={unaccented}
            onChange={(v) => changeTemplate(channel, v)}
          />
          <Field label="Nội dung" hint={`${message.length} ký tự${channel === 'SMS' && message.length > 160 ? ' — vượt 160 ký tự, có thể tách nhiều tin' : ''}`}>
            <Textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          {!phonesOf(group).length && (
            <p className="text-sm text-red-600">Bệnh nhân và người giám hộ đều không có số điện thoại.</p>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ---------------------------- Trang nhắc lịch ---------------------------- */

function RemindersContent() {
  const { can } = useAuth();
  const [date, setDate] = useState(addDays(todayStr(), 1));
  const { data, loading, error, reload } = useApi<{ date: string; groups: ReminderGroup[] }>('/appointments/reminders', {
    date,
  });
  const [calling, setCalling] = useState<ReminderGroup | null>(null);
  const [messaging, setMessaging] = useState<ReminderGroup | null>(null);
  const [rescheduling, setRescheduling] = useState<AppointmentGroup | null>(null);
  const [cancelling, setCancelling] = useState<AppointmentGroup | null>(null);

  const groups = data?.groups ?? [];
  const stats = useMemo(() => {
    const confirmed = groups.filter((g) => g.reminders.some((r) => r.result === 'CONFIRMED')).length;
    const untouched = groups.filter((g) => g.reminders.length === 0).length;
    return { confirmed, untouched };
  }, [groups]);

  const done = () => {
    setCalling(null);
    setMessaging(null);
    setRescheduling(null);
    setCancelling(null);
    reload();
  };

  return (
    <>
      <PageHeader
        title="Nhắc lịch hẹn"
        subtitle="LH-05 · Gọi nhắc khách có lịch ngày mai, ghi kết quả; không nghe máy thì gửi SMS/Zalo (LH-06)"
        actions={
          <>
            <Input type="date" className="w-44" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            <Button variant="secondary" onClick={() => setDate(addDays(todayStr(), 1))}>
              Ngày mai
            </Button>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label={`Lịch ${weekdayOf(date)} ${fmtDate(date)}`} value={groups.length} icon={<CalendarClock className="h-5 w-5" />} />
        <StatCard label="Đã xác nhận" value={stats.confirmed} tone="green" icon={<PhoneCall className="h-5 w-5" />} />
        <StatCard label="Chưa liên hệ" value={stats.untouched} tone="yellow" icon={<PhoneCall className="h-5 w-5" />} />
      </div>
      <AsyncBoundary loading={loading && !data} error={error}>
        <Card bodyClassName="p-0">
          <DataTable
            rows={groups}
            rowKey={(g) => g.booking_group_id}
            empty="Không có lịch hẹn cần nhắc trong ngày này"
            columns={[
              {
                key: 'time',
                header: 'Giờ',
                render: (g) => (
                  <span className="tabular-nums">
                    {g.start_time}–{g.end_time}
                  </span>
                ),
              },
              {
                key: 'patient',
                header: 'Bệnh nhân',
                render: (g) => (
                  <>
                    <div className="font-medium">{g.patient_name}</div>
                    <div className="text-xs text-slate-500">{g.patient_code}</div>
                  </>
                ),
              },
              {
                key: 'phones',
                header: 'Liên hệ',
                render: (g) => (
                  <div className="text-xs">
                    <div>{g.patient_phone ?? '—'}</div>
                    {g.guardian_name && (
                      <div className="text-slate-500">
                        {g.guardian_relationship} {g.guardian_name}: {g.guardian_phone}
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'doctor',
                header: 'Bác sĩ / dịch vụ',
                render: (g) => (
                  <>
                    <div>{g.doctor_name}</div>
                    <div className="text-xs text-slate-500">
                      {g.chair_name}
                      {g.service_name && ` · ${g.service_name}`}
                    </div>
                  </>
                ),
              },
              {
                key: 'history',
                header: 'Lịch sử nhắc',
                render: (g) =>
                  g.reminders.length ? (
                    <div className="flex flex-col gap-1">
                      {g.reminders.map((r) => {
                        const res = labelOf(REMINDER_RESULT, r.result);
                        return (
                          <div
                            key={r.id}
                            className="flex flex-wrap items-center gap-1"
                            title={`${fmtDateTime(r.performed_at)} · ${r.performed_by_name ?? ''}${r.note ? ` · ${r.note}` : ''}${r.message_content ? `\n${r.message_content}` : ''}`}
                          >
                            <Badge color={labelOf(REMINDER_CHANNEL, r.channel).color}>
                              {labelOf(REMINDER_CHANNEL, r.channel).label}
                            </Badge>
                            <Badge color={res.color}>{res.label}</Badge>
                            <span className="text-xs text-slate-500">{fmtDateTime(r.performed_at)}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Chưa liên hệ</span>
                  ),
              },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (g) => (
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <Button size="sm" onClick={() => setCalling(g)}>
                      <PhoneCall className="h-3.5 w-3.5" /> Ghi kết quả gọi
                    </Button>
                    {can('LH-06') && (
                      <Button size="sm" variant="secondary" onClick={() => setMessaging(g)}>
                        <MessageSquare className="h-3.5 w-3.5" /> SMS/Zalo
                      </Button>
                    )}
                    {can('LH-03') && (
                      <Button size="sm" variant="ghost" onClick={() => setRescheduling(g)} title="Đổi lịch">
                        <CalendarClock className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {can('LH-04') && (
                      <Button size="sm" variant="ghost" onClick={() => setCancelling(g)} title="Hủy lịch">
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </Card>
      </AsyncBoundary>

      <CallResultModal group={calling} onClose={() => setCalling(null)} onDone={done} />
      <MessageModal group={messaging} onClose={() => setMessaging(null)} onDone={done} />
      <RescheduleModal group={rescheduling} onClose={() => setRescheduling(null)} onDone={done} />
      <CancelModal group={cancelling} onClose={() => setCancelling(null)} onDone={done} />
    </>
  );
}

export default function RemindersPage() {
  return (
    <RequirePerm perms={['LH-05']}>
      <RemindersContent />
    </RequirePerm>
  );
}
