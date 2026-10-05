import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { KitShell } from '@/app/dev/ui-kit/kit-shell';
import { demoRoutesEnabled } from '@/server/demo/gate';

export const metadata: Metadata = {
  title: 'UI kit',
};

export default function UiKitPage() {
  if (!demoRoutesEnabled()) notFound();
  return <KitShell />;
}
