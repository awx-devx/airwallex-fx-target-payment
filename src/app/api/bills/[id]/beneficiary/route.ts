import { resolveBeneficiaryBodySchema } from '@/contracts/api';
import { SystemClock } from '@/server/adapters/clock';
import { getEnv } from '@/server/env';
import { failureResponse, json, parseBody } from '@/server/http/respond';
import { resolveBeneficiary } from '@/server/services/beneficiaries';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const body = await parseBody(request, resolveBeneficiaryBodySchema);
    return json(await resolveBeneficiary({ billId: id, body, env: getEnv(), clock: new SystemClock() }));
  } catch (error) {
    return failureResponse(error);
  }
}
