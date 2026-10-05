import { WebhookVerificationError } from '@/server/adapters/airwallex/webhooks';
import { SystemClock } from '@/server/adapters/clock';
import { getEnv } from '@/server/env';
import { errorResponse, failureResponse } from '@/server/http/respond';
import { receiveWebhook } from '@/server/services/webhooks';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    const env = getEnv();
    await receiveWebhook({
      env,
      clock: new SystemClock(),
      rawBody: await request.text(),
      signature: request.headers.get('x-signature') ?? '',
      timestamp: request.headers.get('x-timestamp') ?? '',
    });
    return new Response(null, { status: 200 });
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return errorResponse('AIRWALLEX_ERROR', error.message, 400);
    }
    return failureResponse(error);
  }
}
