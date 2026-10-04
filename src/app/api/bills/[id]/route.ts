import { patchBillBodySchema } from '@/contracts/api';
import { getEnv } from '@/server/env';
import { failureResponse, json, parseBody } from '@/server/http/respond';
import { billContext, getBill, patchBill } from '@/server/services/bills';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    return json(await getBill(id, getEnv().DEMO_MODE));
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
