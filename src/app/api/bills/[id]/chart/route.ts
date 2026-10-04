import { chartQuerySchema } from '@/contracts/api';
import { SystemClock } from '@/server/adapters/clock';
import { getEnv } from '@/server/env';
import { failureResponse, json } from '@/server/http/respond';
import { billChart } from '@/server/services/chart';
import { invalid } from '@/server/services/errors';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const range = new URL(request.url).searchParams.get('range');
    const parsed = chartQuerySchema.safeParse({ range });
    if (!parsed.success) throw invalid(parsed.error.issues[0]?.message ?? 'Invalid range');
    const env = getEnv();
    return json(await billChart({ billId: id, range: parsed.data.range, env, clock: new SystemClock() }));
  } catch (error) {
    return failureResponse(error);
  }
}
