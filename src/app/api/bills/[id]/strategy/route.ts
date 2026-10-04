import { putStrategyBodySchema } from '@/contracts/api';
import { getEnv } from '@/server/env';
import { failureResponse, json, parseBody } from '@/server/http/respond';
import { billContext, putStrategy } from '@/server/services/bills';

export const runtime = 'nodejs';

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const body = await parseBody(request, putStrategyBodySchema);
    return json(await putStrategy(id, body, billContext(getEnv())));
  } catch (error) {
    return failureResponse(error);
  }
}
