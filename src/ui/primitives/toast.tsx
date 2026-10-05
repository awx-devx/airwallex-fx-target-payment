'use client';

import { Toast as ToastPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useKitReducedMotion, useTimeFrozen } from '@/ui/motion/freeze';
import { cx } from '@/ui/primitives/cx';
import { dur2, easeOut } from '@/ui/tokens/motion';
import { useReducedMotion } from 'motion/react';

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
        tone === 'target-hit' && 'glow-lg',
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
  /** One live toast per key. A later upsert replaces it instead of stacking. */
  key?: string;
  tone: ToastTone;
  title: string;
  body?: string;
  sticky?: boolean;
  durationMs?: number;
  /** Target hits and deadline payments. Announced immediately. */
  assertive?: boolean;
  onDismiss?: () => void;
}

type ToastInput = Omit<ToastItem, 'id'>;

/** Transient toasts cap at 3. Sticky status toasts stay until dismissed. */
function arrange(items: ToastItem[]): ToastItem[] {
  const sticky = items.filter((item) => item.sticky);
  const transient = items.filter((item) => !item.sticky).slice(-3);
  return [...transient, ...sticky];
}

const Toasts = createContext<{
  push: (toast: ToastInput) => void;
  upsert: (toast: ToastInput & { key: string }) => void;
  dismiss: (key: string) => void;
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

  const api = useRef({
    push(toast: ToastInput) {
      const id = nextId.current;
      nextId.current += 1;
      setItems((current) => arrange([...current, { ...toast, id }]));
    },
    upsert(toast: ToastInput & { key: string }) {
      setItems((current) => {
        const existing = current.find((item) => item.key === toast.key);
        const next: ToastItem = { ...toast, sticky: true, id: existing?.id ?? nextId.current };
        if (!existing) nextId.current += 1;
        if (
          existing &&
          existing.tone === next.tone &&
          existing.title === next.title &&
          existing.body === next.body &&
          existing.assertive === next.assertive
        ) {
          return current;
        }
        return arrange([...current.filter((item) => item.key !== toast.key), next]);
      });
    },
    dismiss(key: string) {
      setItems((current) =>
        current.some((item) => item.key === key) ? current.filter((item) => item.key !== key) : current,
      );
    },
  }).current;

  return (
    <Toasts.Provider value={api}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {/*
          Radix portals each toast into the viewport. The viewport is the
          visible stack; a screen-reader-only viewport would hide the card.
        */}
        <div className="pointer-events-none fixed right-4 bottom-4 z-60">
          <ToastPrimitive.Viewport className="pointer-events-auto m-0 flex w-80 list-none flex-col gap-2 p-0 outline-none" />
        </div>
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <LiveToast
              key={item.id}
              item={item}
              onDismiss={() =>
                setItems((current) => current.filter((toast) => toast.id !== item.id))
              }
            />
          ))}
        </AnimatePresence>
      </ToastPrimitive.Provider>
    </Toasts.Provider>
  );
}

function LiveToast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const assertive = item.assertive || item.tone === 'target-hit';
  const reduced = Boolean(useReducedMotion()) || useKitReducedMotion();
  return (
    <ToastPrimitive.Root
      forceMount
      duration={Infinity}
      type={assertive ? 'foreground' : 'background'}
      className="list-none"
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: reduced ? 0 : dur2, ease: easeOut }}
        className={cx(
          'w-80 rounded-lg border bg-bg-2 p-3',
          TONE[item.tone],
          item.tone === 'target-hit' && 'glow-lg',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <ToastPrimitive.Title className="font-medium">{item.title}</ToastPrimitive.Title>
          <ToastPrimitive.Close
            aria-label="Dismiss"
            className="text-fg-3"
            onClick={() => item.onDismiss?.()}
          >
            <X strokeWidth={1.5} className="size-3.5" />
          </ToastPrimitive.Close>
        </div>
        {item.body ? (
          <ToastPrimitive.Description className="mt-1 text-fg-2">
            {item.body}
          </ToastPrimitive.Description>
        ) : null}
      </motion.div>
    </ToastPrimitive.Root>
  );
}
