'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/ui/primitives/button';
import { Dialog, DialogPreview } from '@/ui/primitives/dialog';
import { FileDropzone, type DropFile } from '@/ui/primitives/file-dropzone';
import { ExtractionOrb } from '@/ui/patterns/extraction-orb';

export type UploadPhase =
  | 'idle'
  | 'dragging'
  | 'uploading'
  | 'extracting'
  | 'partial'
  | 'samples';

export function UploadBody({
  phase,
  files = [],
  onFiles,
  onSamples,
  onReview,
}: {
  phase: UploadPhase;
  files?: readonly DropFile[];
  onFiles?: (files: File[]) => void;
  onSamples?: (count: number) => void;
  onReview?: () => void;
}) {
  const ready = phase === 'extracting' && files.every((file) => !file.error && (file.progress ?? 0) >= 100);
  return (
    <div className="space-y-3">
      <FileDropzone
        files={files}
        dragging={phase === 'dragging'}
        error={phase === 'partial' ? 'Some files could not be read.' : undefined}
        onFiles={onFiles}
        mark={(file) =>
          file.extraction ? <ExtractionOrb state={file.extraction} size={20} /> : null
        }
      />
      {/* DEMO-ONLY: sample invoices are generated. PROD: only uploaded documents are extracted. */}
      <div className="flex flex-wrap gap-2">
        {[1, 3, 5].map((count) => (
          <Button key={count} size="sm" variant="secondary" onClick={() => onSamples?.(count)}>
            Add {count} sample {count === 1 ? 'invoice' : 'invoices'}
          </Button>
        ))}
      </div>
      {phase === 'samples' ? <p className="text-xs text-orange-300">Generating sample invoices.</p> : null}
      {ready || phase === 'partial' ? (
        <Button onClick={onReview}>Review {files.filter((file) => !file.error).length} bills</Button>
      ) : null}
    </div>
  );
}

export function UploadPreview({
  phase,
  files,
}: {
  phase: UploadPhase;
  files?: readonly DropFile[];
}) {
  return (
    <DialogPreview title="Upload bills" description="PDF, image, or XML" size="md">
      <UploadBody phase={phase} files={files} />
    </DialogPreview>
  );
}

export function UploadModal({
  open,
  onOpenChange,
  phase,
  files,
  onFiles,
  onSamples,
  onReview,
  trigger = <Button>Upload bills</Button>,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phase: UploadPhase;
  files?: readonly DropFile[];
  onFiles?: (files: File[]) => void;
  onSamples?: (count: number) => void;
  onReview?: () => void;
  trigger?: ReactNode | null;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Upload bills"
      description="PDF, image, or XML"
      trigger={trigger ?? undefined}
    >
      <UploadBody phase={phase} files={files} onFiles={onFiles} onSamples={onSamples} onReview={onReview} />
    </Dialog>
  );
}

export function UploadDemo() {
  const [open, setOpen] = useState(false);
  return (
    <UploadModal
      open={open}
      onOpenChange={setOpen}
      phase="idle"
      onSamples={() => undefined}
    />
  );
}
