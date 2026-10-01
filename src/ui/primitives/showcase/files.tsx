'use client';

import { useState } from 'react';
import type { Showcase } from '@/ui/showcase/types';
import { FileDropzone } from '@/ui/primitives/file-dropzone';
import { Stepper } from '@/ui/primitives/stepper';
import { Cell } from '@/ui/primitives/showcase/frame';

export const fileShowcases: Showcase[] = [
  {
    id: 'dropzone',
    group: 'primitives',
    title: 'FileDropzone',
    importPath: '@/ui/primitives/file-dropzone',
    sections: [
      {
        id: 'dropzone-matrix',
        title: 'Idle, drag-over, uploading, error',
        render: () => <Dropzones />,
      },
    ],
  },
  {
    id: 'stepper',
    group: 'primitives',
    title: 'Stepper',
    importPath: '@/ui/primitives/stepper',
    sections: [
      {
        id: 'stepper-matrix',
        title: 'Current, complete, error',
        render: () => (
          <Cell label="upload">
            <Stepper
              steps={[
                { label: 'Upload', state: 'complete' },
                { label: 'Review', state: 'current' },
                { label: 'Arm', state: 'error' },
                { label: 'Watch', state: 'upcoming' },
              ]}
            />
          </Cell>
        ),
      },
    ],
  },
];

function Dropzones() {
  const [names, setNames] = useState<string[]>([]);
  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <Cell label="idle md">
        <FileDropzone onFiles={(files) => setNames(files.map((file) => file.name))} />
        {names.length > 0 ? <p className="text-fg-3">{names.join(', ')}</p> : null}
      </Cell>
      <Cell label="lg">
        <FileDropzone size="lg" />
      </Cell>
      <Cell label="drag-over">
        <FileDropzone dragging />
      </Cell>
      <Cell label="uploading">
        <FileDropzone
          files={[
            { name: 'helios.pdf', progress: 40 },
            { name: 'kite.xml', progress: 100 },
          ]}
        />
      </Cell>
      <Cell label="error" className="sm:col-span-2">
        <FileDropzone
          error="Only PDF, PNG, and XML invoices are accepted."
          files={[{ name: 'notes.txt', error: 'Unsupported file' }]}
        />
      </Cell>
    </div>
  );
}
