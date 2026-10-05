import { billStateSchema } from '@/contracts/bill';
import { SystemClock } from '@/server/adapters/clock';
import { getEnv } from '@/server/env';
import { failureResponse, json, parseBody } from '@/server/http/respond';
import { seedGenerated } from '@/server/services/seed';
import { PROFILE_NAMES } from '@/mocks/generators/profiles';
import { z } from 'zod';

export const runtime = 'nodejs';

const bodySchema = z.object({
  profile: z.enum(PROFILE_NAMES).optional(),
  seed: z.number().int().nonnegative().optional(),
  count: z.number().int().positive().max(200).optional(),
  currencies: z.array(z.string().length(3)).optional(),
  states: z.array(billStateSchema).optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await parseBody(request, bodySchema);
    return json(
      await seedGenerated({ env: getEnv(), clock: new SystemClock(), ...body }),
    );
  } catch (error) {
    return failureResponse(error);
  }
}
