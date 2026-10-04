import { getEnv } from '@/server/env';
import { failureResponse, json } from '@/server/http/respond';
import { billReadContext, getBill, todayFor } from '@/server/services/bills';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const env = getEnv();
    const detail = await getBill(id, env.DEMO_MODE, todayFor(env), billReadContext(env));
    return json(detail.events);
  } catch (error) {
    return failureResponse(error);
  }
}
