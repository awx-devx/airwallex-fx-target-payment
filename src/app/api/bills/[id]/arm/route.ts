import { armBodySchema } from '@/contracts/api';
import { getEnv } from '@/server/env';
import { failureResponse, json, parseBody } from '@/server/http/respond';
import { armBill, billContext } from '@/server/services/bills';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const body = await parseBody(request, armBodySchema);
    return json(await armBill(id, body, billContext(getEnv())));
  } catch (error) {
    return failureResponse(error);
  }
}
