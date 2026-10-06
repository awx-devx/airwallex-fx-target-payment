import { getEnv } from '@/server/env';
import { failureResponse, json } from '@/server/http/respond';
import { billContext, reviewBill } from '@/server/services/bills';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    return json(await reviewBill(id, billContext(getEnv())));
  } catch (error) {
    return failureResponse(error);
  }
}
