import type { BillEventType } from '@/contracts/events';
import { appEventSchema, type AppEvent } from '@/contracts/sse';

/**
 * In-app notification for a bill transition. Deadline, paid, and failed are
 * emitted when those transitions run. Target hit and pay now emit now.
 */
export function notificationFor(input: {
  billId: string;
  auditType: BillEventType;
  at: Date;
  payload?: Record<string, unknown>;
}): AppEvent | null {
  const message = messageFor(input.auditType, input.payload);
  if (!message) return null;
  return appEventSchema.parse({
    type: 'notification',
    notification: {
      id: `${input.billId}.${input.auditType}.${input.at.getTime()}`,
      billId: input.billId,
      title: message.title,
      body: message.body,
      level: message.level,
      createdAt: input.at.toISOString(),
      href: `/bills/${input.billId}`,
    },
  });
}

function messageFor(
  auditType: BillEventType,
  payload?: Record<string, unknown>,
): { title: string; body: string; level: 'info' | 'success' | 'warn' | 'danger' } | null {
  if (auditType === 'QUOTE_LOCKED') {
    if (payload?.mode === 'MANUAL') {
      return { title: 'Paying now', body: 'The transfer is being created.', level: 'success' };
    }
    return { title: 'Target hit', body: 'Paying at the locked quote.', level: 'success' };
  }
  if (auditType === 'AUTOSETTLE') {
    return { title: 'Paying at the deadline', body: 'The transfer is being created.', level: 'success' };
  }
  if (auditType === 'PAID') {
    return { title: 'Paid', body: 'The transfer settled.', level: 'success' };
  }
  if (auditType === 'FAILED') {
    return { title: 'Payment failed', body: 'The transfer did not settle.', level: 'danger' };
  }
  return null;
}
