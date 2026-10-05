import { SystemClock } from '@/server/adapters/clock';
import { getEnv } from '@/server/env';
import { failureResponse, json } from '@/server/http/respond';
import { stopSimulation } from '@/server/services/demo';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    return json(
      await stopSimulation({
        env: getEnv(),
        clock: new SystemClock(),
        billId: id,
      }),
    );
  } catch (error) {
    return failureResponse(error);
  }
}
