import { decimalStringSchema } from '@/contracts/airwallex';
import { getEnv } from '@/server/env';
import { failureResponse, json, parseBody } from '@/server/http/respond';
import { enqueueMarket } from '@/server/services/demo';
import { z } from 'zod';

export const runtime = 'nodejs';

const bodySchema = z.object({
  nudgePips: z.number().optional(),
  rampTo: decimalStringSchema.optional(),
  seconds: z.number().positive().optional(),
  vol: z.number().nonnegative().optional(),
  drift: z.number().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ pair: string }> },
): Promise<Response> {
  try {
    const { pair } = await context.params;
    const body = await parseBody(request, bodySchema);
    return json(await enqueueMarket({ env: getEnv(), pair, ...body }));
  } catch (error) {
    return failureResponse(error);
  }
}
