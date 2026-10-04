import { getEnv } from '@/server/env';
import { failureResponse, json } from '@/server/http/respond';
import { listCurrencies } from '@/server/services/reference';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    const env = getEnv();
    return json(await listCurrencies({ env, paymentsGateway: env.PAYMENTS_GATEWAY }));
  } catch (error) {
    return failureResponse(error);
  }
}
