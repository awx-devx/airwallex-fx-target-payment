import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { KitShell } from '@/app/dev/ui-kit/kit-shell';

export const metadata: Metadata = {
  title: 'UI kit',
};

export default function UiKitPage() {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.DEMO_MODE !== 'true'
  ) {
    notFound();
  }
  return <KitShell />;
}
