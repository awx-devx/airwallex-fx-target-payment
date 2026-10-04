import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_BYTES = 20 * 1024 * 1024;

export interface StoredFile {
  sha256: string;
  storageKey: string;
  size: number;
}

/**
 * DEMO-ONLY: invoice files sit on the local disk under `storage/`.
 * PROD: encrypted object storage with retention rules.
 */
export function localStorage(root = path.join(process.cwd(), 'storage')) {
  return {
    async put(filename: string, bytes: Uint8Array): Promise<StoredFile> {
      if (bytes.byteLength > MAX_BYTES) throw new Error('file exceeds 20 MB');
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const storageKey = `${sha256}${extension(filename)}`;
      await mkdir(root, { recursive: true });
      const target = path.join(root, storageKey);
      try {
        await writeFile(target, bytes, { flag: 'wx' });
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
      }
      return { sha256, storageKey, size: bytes.byteLength };
    },
    read(storageKey: string): Promise<Uint8Array> {
      return readFile(path.join(root, path.basename(storageKey)));
    },
  };
}

function extension(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf' || ext === '.png' || ext === '.jpg' || ext === '.jpeg') return ext === '.jpeg' ? '.jpg' : ext;
  return '';
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}
