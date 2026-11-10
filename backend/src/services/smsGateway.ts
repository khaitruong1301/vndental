// Cổng gửi tin nhắn nhắc lịch (LH-06). Giai đoạn 1 chưa tích hợp nhà cung cấp SMS/Zalo thật:
// LoggingGateway chỉ ghi log và trả mã tin giả. Thay `messageGateway` bằng triển khai thật khi tích hợp.

export type MessageChannel = 'SMS' | 'ZALO';

export interface OutgoingMessage {
  channel: MessageChannel;
  to: string;
  content: string;
}

export interface SendResult {
  ok: boolean;
  providerMessageId: string | null;
  error?: string;
}

export interface MessageGateway {
  send(message: OutgoingMessage): Promise<SendResult>;
}

const clinicDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

class LoggingGateway implements MessageGateway {
  async send(message: OutgoingMessage): Promise<SendResult> {
    const ymd = clinicDate.format(new Date()).replaceAll('-', '');
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    const providerMessageId = `${message.channel}-${ymd}-${random}`;
    console.info(`[${message.channel}] → ${message.to} (${providerMessageId}): ${message.content}`);
    return { ok: true, providerMessageId };
  }
}

export const messageGateway: MessageGateway = new LoggingGateway();
