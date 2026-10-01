'use client';

import type { DragEvent, ReactNode } from 'react';
import { cx } from '@/ui/primitives/cx';
import { ProgressBar } from '@/ui/primitives/progress';

export interface DropFile {
  name: string;
  progress?: number;
  error?: string;
}

export function FileDropzone({
  files = [],
  dragging = false,
  error,
  size = 'md',
  onFiles,
}: {
  files?: readonly DropFile[];
  dragging?: boolean;
  error?: string;
  size?: 'md' | 'lg';
  onFiles?: (files: File[]) => void;
}) {
  function drop(event: DragEvent) {
    event.preventDefault();
    onFiles?.([...event.dataTransfer.files]);
  }
  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={drop}
      className={cx(
        'rounded-md border border-dashed px-4 text-center',
        size === 'lg' ? 'py-10' : 'py-6',
        dragging ? 'border-orange-500 shadow-[var(--glow-md)]' : 'border-line-2',
        error && 'border-down',
      )}
    >
      <p className="text-fg-2">Drop invoices here, or choose files</p>
      {error ? <p className="mt-2 text-down">{error}</p> : null}
      <ul className="mt-3 space-y-2 text-left">
        {files.map((file) => (
          <li key={file.name}>
            <p className="num">{file.name}</p>
            {file.error ? <p className="text-down">{file.error}</p> : null}
            {file.progress !== undefined ? (
              <ProgressBar value={file.progress} label={file.name} />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DropHint({ children }: { children: ReactNode }) {
  return <p className="text-fg-3">{children}</p>;
}
