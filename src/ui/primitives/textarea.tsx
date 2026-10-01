'use client';

import type { TextareaHTMLAttributes } from 'react';
import { fieldClass } from '@/ui/primitives/field';

export function Textarea({
  error,
  maxLength,
  value,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string }) {
  const length = typeof value === 'string' ? value.length : 0;
  return (
    <label className="block">
      <textarea
        value={value}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        className={fieldClass({ error: Boolean(error) }) + ' h-auto min-h-20 py-2 ' + (className ?? '')}
        {...props}
      />
      <span className="mt-1 flex justify-between gap-3">
        <span className="text-down">{error}</span>
        {maxLength ? (
          <span className="num text-fg-3">
            {length}/{maxLength}
          </span>
        ) : null}
      </span>
    </label>
  );
}
