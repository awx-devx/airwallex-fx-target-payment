import { readRealMs, SystemClock } from '@/server/adapters/clock';
import { getEnv } from '@/server/env';
import { failureResponse, json, parseBody } from '@/server/http/respond';
import { startSimulation } from '@/server/services/demo';
import { z } from 'zod';

export const runtime = 'nodejs';

const bodySchema = z.object({
  durationSec: z.number().positive().max(120).optional(),
  overshootBps: z.number().min(0).max(500).optional(),
  advanceEverySec: z.number().positive().max(60).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const body = await parseBody(request, bodySchema);
    return json(
      await startSimulation({
        env: getEnv(),
        clock: new SystemClock(),
        billId: id,
        nowRealMs: readRealMs(),
        ...body,
      }),
    );
  } catch (error) {
    return failureResponse(error);
  }
}
