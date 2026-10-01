'use client';

import { useParams } from 'next/navigation';
import { TerminalScreen } from '@/features/terminal/terminal';

export default function BillPage() {
  const params = useParams<{ id: string }>();
  return <TerminalScreen billId={params.id} />;
}
