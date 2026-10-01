'use client';

import { useParams } from 'next/navigation';
import { TerminalScreen } from '@/features/terminal/terminal';

export default function ApprovalPage() {
  const params = useParams<{ id: string }>();
  return <TerminalScreen approvalId={params.id} />;
}
