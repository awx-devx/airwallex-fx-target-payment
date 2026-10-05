import { readRealMs } from '@/server/adapters/clock';
import { getEnv } from '@/server/env';
import { failureResponse, json, parseBody } from '@/server/http/respond';
import { setDemoClock } from '@/server/services/demo';
import { z } from 'zod';

export const runtime = 'nodejs';

const bodySchema = z.object({
  speed: z.number().positive().max(10_000).optional(),
  jumpTo: z.string().optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await parseBody(request, bodySchema);
    return json(await setDemoClock({ env: getEnv(), readRealMs, ...body }));
  } catch (error) {
    return failureResponse(error);
  }
}
