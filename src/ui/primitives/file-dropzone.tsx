'use client';

import type { DragEvent, ReactNode } from 'react';
import { cx } from '@/ui/primitives/cx';
import { ProgressBar } from '@/ui/primitives/progress';

export type ExtractionStage = 'working' | 'searching' | 'solving';

export interface DropFile {
  name: string;
  progress?: number;
  error?: string;
  /** Set while extraction status is RUNNING. Cleared when the file is done or failed. */
  extraction?: ExtractionStage;
}

export function FileDropzone({
  files = [],
  dragging = false,
  error,
  size = 'md',
  onFiles,
  mark,
}: {
  files?: readonly DropFile[];
  dragging?: boolean;
  error?: string;
  size?: 'md' | 'lg';
  onFiles?: (files: File[]) => void;
  /** Per-file mark rendered by the caller. Upload uses it for the extraction orb. */
  mark?: (file: DropFile) => ReactNode;
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
        dragging ? 'border-orange-500' : 'border-line-2',
        error && 'border-down',
      )}
    >
      <p className="text-fg-2">Drop invoices here, or choose files</p>
      {error ? <p className="mt-2 text-down">{error}</p> : null}
      <ul className="mt-3 space-y-2 text-left">
        {files.map((file) => (
          <li key={file.name} className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="num">{file.name}</p>
              {file.error ? <p className="text-down">{file.error}</p> : null}
              {file.progress !== undefined && !file.extraction ? (
                <ProgressBar value={file.progress} label={file.name} />
              ) : null}
            </div>
            {mark?.(file)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DropHint({ children }: { children: ReactNode }) {
  return <p className="text-fg-3">{children}</p>;
}
