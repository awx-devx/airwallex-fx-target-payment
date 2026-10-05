import { SystemClock } from '@/server/adapters/clock';
import { getEnv } from '@/server/env';
import { failureResponse, json, parseBody } from '@/server/http/respond';
import { advanceDemoTransfer } from '@/server/services/demo';
import { z } from 'zod';

export const runtime = 'nodejs';

const bodySchema = z.object({
  to: z.enum(['PROCESSING', 'SENT', 'PAID', 'FAILED']).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const body = await parseBody(request, bodySchema);
    return json(
      await advanceDemoTransfer({
        env: getEnv(),
        clock: new SystemClock(),
        transferId: id,
        ...(body.to ? { to: body.to } : {}),
      }),
    );
  } catch (error) {
    return failureResponse(error);
  }
}
