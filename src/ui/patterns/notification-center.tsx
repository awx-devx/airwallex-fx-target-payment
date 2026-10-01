'use client';

import { Button } from '@/ui/primitives/button';
import { Popover } from '@/ui/primitives/popover';

export interface Notice {
  id: string;
  billId: string;
  vendor: string;
  title: string;
  unread: boolean;
  action?: string;
}

export function NotificationList({
  notices,
  onOpen,
}: {
  notices: readonly Notice[];
  onOpen?: (notice: Notice) => void;
}) {
  const groups = new Map<string, Notice[]>();
  for (const notice of notices) {
    const list = groups.get(notice.billId) ?? [];
    list.push(notice);
    groups.set(notice.billId, list);
  }
  if (notices.length === 0) return <p className="text-fg-3">No notifications.</p>;
  return (
    <div className="max-h-80 space-y-3 overflow-auto">
      {[...groups.entries()].map(([billId, list]) => (
        <div key={billId}>
          <p className="text-xs text-fg-3">{list[0]?.vendor}</p>
          <ul>
            {list.map((notice) => (
              <li key={notice.id}>
                <button
                  type="button"
                  onClick={() => onOpen?.(notice)}
                  className="flex w-full items-start justify-between gap-3 py-1 text-left"
                >
                  <span className={notice.unread ? 'text-fg-1' : 'text-fg-3'}>{notice.title}</span>
                  {notice.action ? <span className="text-xs text-orange-300">{notice.action}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function NotificationCenter({
  notices,
  onOpen,
}: {
  notices: readonly Notice[];
  onOpen?: (notice: Notice) => void;
}) {
  const unread = notices.filter((notice) => notice.unread).length;
  return (
    <Popover trigger={<Button variant="secondary" size="sm">{unread} unread</Button>}>
      <NotificationList notices={notices} onOpen={onOpen} />
    </Popover>
  );
}
