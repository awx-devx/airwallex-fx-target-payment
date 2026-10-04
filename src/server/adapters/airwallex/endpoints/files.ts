import type { AirwallexClient } from '@/server/adapters/airwallex/client';
import { AirwallexError } from '@/server/adapters/airwallex/errors';

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_FILENAME = 50;

export async function uploadFile(
  client: AirwallexClient,
  input: { filename: string; bytes: Uint8Array; contentType?: string },
): Promise<unknown> {
  client.assertFilesEnabled();
  if (input.filename.length === 0 || input.filename.length > MAX_FILENAME) {
    throw new AirwallexError({
      status: 400,
      code: 'validation_failed',
      message: 'filename must be 1–50 characters',
    });
  }
  if (input.bytes.byteLength > MAX_BYTES) {
    throw new AirwallexError({
      status: 400,
      code: 'validation_failed',
      message: 'file exceeds 20 MB',
    });
  }
  const copy = new ArrayBuffer(input.bytes.byteLength);
  new Uint8Array(copy).set(input.bytes);
  const form = new FormData();
  form.append(
    'file',
    new Blob([copy], { type: input.contentType ?? 'application/octet-stream' }),
    input.filename,
  );
  return client.request({
    method: 'POST',
    path: '/files/upload',
    body: form,
    host: 'files',
  });
}
