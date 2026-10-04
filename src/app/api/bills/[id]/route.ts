import { patchBillBodySchema } from '@/contracts/api';
import { getEnv } from '@/server/env';
import { failureResponse, json, parseBody } from '@/server/http/respond';
import { billContext, billReadContext, getBill, patchBill, todayFor } from '@/server/services/bills';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const env = getEnv();
    return json(await getBill(id, env.DEMO_MODE, todayFor(env), billReadContext(env)));
  } catch (error) {
    return failureResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const body = await parseBody(request, patchBillBodySchema);
    return json(await patchBill(id, body, billContext(getEnv())));
  } catch (error) {
    return failureResponse(error);
  }
}
