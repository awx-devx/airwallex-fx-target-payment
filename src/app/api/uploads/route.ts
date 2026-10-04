import { SystemClock } from '@/server/adapters/clock';
import { getEnv } from '@/server/env';
import { failureResponse, json } from '@/server/http/respond';
import { enqueueExtraction } from '@/server/queue/extraction';
import { ingestUploads, type UploadInput } from '@/server/services/uploads';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    const form = await request.formData();
    const files: UploadInput[] = [];
    for (const [key, value] of form.entries()) {
      if (key !== 'file' && key !== 'files') continue;
      if (!(value instanceof File)) continue;
      files.push({
        filename: value.name,
        mime: value.type || mimeFromName(value.name),
        bytes: new Uint8Array(await value.arrayBuffer()),
      });
    }
    const env = getEnv();
    const bills = await ingestUploads({
      files,
      env,
      clock: new SystemClock(),
      enqueue: (documentId) => enqueueExtraction(env.REDIS_URL, documentId),
    });
    return json({ bills }, 201);
  } catch (error) {
    return failureResponse(error);
  }
}

function mimeFromName(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}
