'use client';

import { Toast as ToastPrimitive } from 'radix-ui';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cx } from '@/ui/primitives/cx';
import { useTimeFrozen } from '@/ui/motion/freeze';

export type ToastTone = 'info' | 'success' | 'warning' | 'error' | 'target-hit';

const TONE: Record<ToastTone, string> = {
  info: 'border-info',
  success: 'border-up',
  warning: 'border-warn',
  error: 'border-down',
  'target-hit': 'border-orange-500',
};

export function ToastCard({
  tone,
  title,
  body,
  action,
  countdown,
  onDismiss,
}: {
  tone: ToastTone;
  title: string;
  body?: string;
  action?: ReactNode;
  countdown?: string;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="status"
      className={cx(
        'w-80 rounded-lg border bg-bg-2 p-3',
        TONE[tone],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">{title}</p>
        {countdown ? <span className="num text-fg-2">{countdown}</span> : null}
      </div>
      {body ? <p className="mt-1 text-fg-2">{body}</p> : null}
      {action || onDismiss ? (
        <div className="mt-3 flex justify-end gap-2">
          {action}
          {onDismiss ? (
            <button type="button" onClick={onDismiss} className="text-fg-3">
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
  sticky?: boolean;
  durationMs?: number;
}

const Toasts = createContext<{
  push: (toast: Omit<ToastItem, 'id'>) => void;
} | null>(null);

export function useToasts() {
  const context = useContext(Toasts);
  if (!context) throw new Error('useToasts needs ToastProvider');
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const frozen = useTimeFrozen();

  useEffect(() => {
    if (frozen) return;
    const timers = items
      .filter((item) => !item.sticky)
      .map((item) =>
        window.setTimeout(() => {
          setItems((current) => current.filter((toast) => toast.id !== item.id));
        }, item.durationMs ?? 4000),
      );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [items, frozen]);

  return (
    <Toasts.Provider
      value={{
        push(toast) {
          const id = nextId.current;
          nextId.current += 1;
          setItems((current) => [...current, { ...toast, id }].slice(-4));
        },
      }}
    >
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        <div className="fixed right-4 bottom-4 z-[60] flex flex-col gap-2">
          {items.map((item) => (
            <ToastPrimitive.Root
              key={item.id}
              className={cx(
                'w-80 rounded-lg border bg-bg-2 p-3',
                TONE[item.tone],
              )}
              onOpenChange={(open) => {
                if (!open) {
                  setItems((current) => current.filter((toast) => toast.id !== item.id));
                }
              }}
            >
              <ToastPrimitive.Title className="font-medium">{item.title}</ToastPrimitive.Title>
              {item.body ? (
                <ToastPrimitive.Description className="mt-1 text-fg-2">
                  {item.body}
                </ToastPrimitive.Description>
              ) : null}
            </ToastPrimitive.Root>
          ))}
        </div>
        <ToastPrimitive.Viewport className="sr-only" />
      </ToastPrimitive.Provider>
    </Toasts.Provider>
  );
}
