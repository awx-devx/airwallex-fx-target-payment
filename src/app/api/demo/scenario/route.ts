import { readRealMs, SystemClock } from '@/server/adapters/clock';
import { getEnv } from '@/server/env';
import { failureResponse, json, parseBody } from '@/server/http/respond';
import { runScenario } from '@/server/services/demo';
import { z } from 'zod';

export const runtime = 'nodejs';

const bodySchema = z.object({
  name: z.enum([
    'target-hit',
    'stay-watching',
    'deadline-pay',
    'insufficient-balance',
  ]),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await parseBody(request, bodySchema);
    return json(
      await runScenario({
        env: getEnv(),
        clock: new SystemClock(),
        nowRealMs: readRealMs(),
        name: body.name,
      }),
    );
  } catch (error) {
    return failureResponse(error);
  }
}
