'use client';

import { Dialog as DialogPrimitive } from 'radix-ui';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { dur2, dur3, easeOut } from '@/ui/tokens/motion';
import { cx } from '@/ui/primitives/cx';

export type DialogTone = 'default' | 'glow' | 'danger';
export type DialogSize = 'sm' | 'md' | 'lg';

const WIDTH: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

export function Dialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  tone = 'default',
  size = 'md',
  scroll = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  tone?: DialogTone;
  size?: DialogSize;
  scroll?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? (
        <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      ) : null}
      <DialogPrimitive.Portal forceMount>
        <AnimatePresence>
          {open ? (
            <div key="dialog" className="fixed inset-0 z-[70] flex items-center justify-center p-6">
              <DialogPrimitive.Overlay asChild forceMount>
                <motion.div
                  className="absolute inset-0"
                  style={{
                    background: 'var(--bg-overlay)',
                    backdropFilter: 'blur(12px)',
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: dur2, ease: easeOut }}
                />
              </DialogPrimitive.Overlay>
              <DialogPrimitive.Content asChild forceMount>
                <motion.div
                  className={cx(
                    'relative z-10 w-full rounded-lg border border-line-1 bg-bg-1 p-5 shadow-[var(--shadow-panel)]',
                    WIDTH[size],
                    tone === 'glow' && 'glow-lg',
                    tone === 'danger' && 'border-down',
                  )}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: dur3, ease: easeOut }}
                >
                  <DialogPrimitive.Title className="text-base font-medium">
                    {title}
                  </DialogPrimitive.Title>
                  {description ? (
                    <DialogPrimitive.Description className="mt-1 text-fg-2">
                      {description}
                    </DialogPrimitive.Description>
                  ) : (
                    <DialogPrimitive.Description className="sr-only">
                      {title}
                    </DialogPrimitive.Description>
                  )}
                  <div className={cx('mt-4', scroll && 'max-h-40 overflow-auto')}>
                    {children}
                  </div>
                  {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
                </motion.div>
              </DialogPrimitive.Content>
            </div>
          ) : null}
        </AnimatePresence>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Drawer({
  open,
  onOpenChange,
  trigger,
  title,
  children,
  side = 'right',
  size = 'md',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
  title: string;
  children?: ReactNode;
  side?: 'right' | 'bottom';
  size?: 'md' | 'lg';
}) {
  const from = side === 'right' ? { x: 24 } : { y: 24 };
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? (
        <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      ) : null}
      <DialogPrimitive.Portal forceMount>
        <AnimatePresence>
          {open ? (
            <div key="drawer" className="fixed inset-0 z-[70]">
              <DialogPrimitive.Overlay asChild forceMount>
                <motion.div
                  className="absolute inset-0"
                  style={{ background: 'var(--bg-overlay)', backdropFilter: 'blur(12px)' }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: dur2, ease: easeOut }}
                />
              </DialogPrimitive.Overlay>
              <DialogPrimitive.Content asChild forceMount>
                <motion.div
                  className={cx(
                    'absolute z-10 border-line-1 bg-bg-1 p-5 shadow-[var(--shadow-panel)]',
                    side === 'right' ? 'top-0 right-0 h-full border-l' : 'right-0 bottom-0 left-0 border-t',
                    side === 'right' && (size === 'lg' ? 'w-[420px]' : 'w-80'),
                  )}
                  initial={{ opacity: 0, ...from }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  exit={{ opacity: 0, ...from }}
                  transition={{ duration: dur3, ease: easeOut }}
                >
                  <DialogPrimitive.Title className="text-base font-medium">
                    {title}
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Description className="sr-only">
                    {title}
                  </DialogPrimitive.Description>
                  <div className="mt-4">{children}</div>
                </motion.div>
              </DialogPrimitive.Content>
            </div>
          ) : null}
        </AnimatePresence>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function DialogPreview({
  title,
  description,
  children,
  footer,
  tone = 'default',
  size = 'md',
  scroll = false,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  tone?: DialogTone;
  size?: DialogSize;
  scroll?: boolean;
}) {
  return (
    <div
      className={cx(
        'w-full rounded-lg border border-line-1 bg-bg-1 p-5 shadow-[var(--shadow-panel)]',
        WIDTH[size],
        tone === 'glow' && 'glow-lg',
        tone === 'danger' && 'border-down',
      )}
    >
      <p className="text-base font-medium">{title}</p>
      {description ? <p className="mt-1 text-fg-2">{description}</p> : null}
      <div className={cx('mt-4', scroll && 'max-h-40 overflow-auto')}>{children}</div>
      {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
    </div>
  );
}

export function DrawerPreview({
  title,
  children,
  side = 'right',
  size = 'md',
}: {
  title: string;
  children?: ReactNode;
  side?: 'right' | 'bottom';
  size?: 'md' | 'lg';
}) {
  return (
    <div className="relative h-48 overflow-hidden rounded-md border border-line-1 bg-bg-0">
      <div
        className={cx(
          'absolute border-line-1 bg-bg-1 p-4 shadow-[var(--shadow-panel)]',
          side === 'right' ? 'inset-y-0 right-0 border-l' : 'inset-x-0 bottom-0 border-t',
          side === 'right' && (size === 'lg' ? 'w-56' : 'w-40'),
        )}
      >
        <p className="text-base font-medium">{title}</p>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
