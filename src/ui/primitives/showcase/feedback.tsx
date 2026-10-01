'use client';

import { Inbox } from 'lucide-react';
import { useState } from 'react';
import type { Showcase } from '@/ui/showcase/types';
import { Banner } from '@/ui/primitives/banner';
import { Button } from '@/ui/primitives/button';
import { EmptyState } from '@/ui/primitives/empty-state';
import { ToastCard, useToasts, type ToastTone } from '@/ui/primitives/toast';
import { Cell } from '@/ui/primitives/showcase/frame';

const TONES: ToastTone[] = ['info', 'success', 'warning', 'error', 'target-hit'];

function ToastStack() {
  const { push } = useToasts();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            push({ tone: 'info', title: 'Quote refreshed', body: 'Valid for 15 seconds.' })
          }
        >
          Auto-dismiss
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            push({
              tone: 'target-hit',
              title: 'Target hit',
              body: 'Stays until you dismiss it.',
              sticky: true,
            })
          }
        >
          Sticky
        </Button>
      </div>
      <div className="flex max-w-sm flex-col gap-2">
        {TONES.map((tone) => (
          <ToastCard
            key={tone}
            tone={tone}
            title={tone === 'target-hit' ? 'Target hit · EUR/USD' : tone}
            body={
              tone === 'target-hit'
                ? '1.07480 is through the target. Quote locked.'
                : 'Stacked with the cards above and below.'
            }
            countdown={tone === 'target-hit' ? '00:14' : undefined}
            action={
              tone === 'target-hit' ? (
                <Button size="sm">Approve</Button>
              ) : undefined
            }
            onDismiss={() => undefined}
          />
        ))}
      </div>
    </div>
  );
}

function Banners() {
  const [visible, setVisible] = useState(true);
  return (
    <div className="grid max-w-xl gap-2">
      <Banner tone="info">Rates are delayed by a few seconds.</Banner>
      <Banner tone="warn">Final day. Approval is due before the cutoff.</Banner>
      <Banner tone="error">The quote expired. A new one is on the way.</Banner>
      <Banner tone="demo-mode">Demo mode · simulated market.</Banner>
      {visible ? (
        <Banner tone="info" onDismiss={() => setVisible(false)}>
          Dismissible banner.
        </Banner>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setVisible(true)}>
          Show banner
        </Button>
      )}
    </div>
  );
}

export const feedbackShowcases: Showcase[] = [
  {
    id: 'toast',
    group: 'primitives',
    title: 'Toast',
    importPath: '@/ui/primitives/toast',
    description: 'Auto-dismiss pauses while the kit clock is frozen. Sticky toasts stay.',
    sections: [
      {
        id: 'toast-matrix',
        title: 'Tones, actions, stacking',
        render: () => <ToastStack />,
      },
    ],
  },
  {
    id: 'banner',
    group: 'primitives',
    title: 'Banner',
    importPath: '@/ui/primitives/banner',
    sections: [{ id: 'banner-matrix', title: 'Info, warn, error, demo', render: () => <Banners /> }],
  },
  {
    id: 'empty',
    group: 'primitives',
    title: 'EmptyState',
    importPath: '@/ui/primitives/empty-state',
    sections: [
      {
        id: 'empty-matrix',
        title: 'Icon, title, body, action',
        render: () => (
          <Cell label="empty">
            <EmptyState
              icon={<Inbox strokeWidth={1.5} className="size-8" />}
              title="No bills yet"
              body="Upload a foreign-currency invoice to open a position."
              action={<Button size="sm">Upload invoice</Button>}
            />
          </Cell>
        ),
      },
    ],
  },
];
