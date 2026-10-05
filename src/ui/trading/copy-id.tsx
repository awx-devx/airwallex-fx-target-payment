'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from '@/ui/primitives/icon-button';
import { cx } from '@/ui/primitives/cx';

export function CopyId({
  value,
  prominent = false,
}: {
  value: string;
  prominent?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className={cx('num truncate', prominent ? 'text-sm' : 'text-xs')}>{value}</span>
      <IconButton
        label={copied ? 'Copied' : 'Copy'}
        size="xs"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          });
        }}
      >
        {copied ? <Check strokeWidth={1.5} className="size-3" /> : <Copy strokeWidth={1.5} className="size-3" />}
      </IconButton>
    </span>
  );
}
