import { SystemClock } from '@/server/adapters/clock';
import { getEnv } from '@/server/env';
import { failureResponse, json, parseBody } from '@/server/http/respond';
import { createSampleBills } from '@/server/services/seed';
import { z } from 'zod';

export const runtime = 'nodejs';

const bodySchema = z.object({
  count: z.number().int().min(1).max(5).default(1),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await parseBody(request, bodySchema);
    const ids = await createSampleBills({
      env: getEnv(),
      clock: new SystemClock(),
      count: body.count,
    });
    return json({ ids }, 201);
  } catch (error) {
    return failureResponse(error);
  }
}
