import { getEnv } from '@/server/env';
import { failureResponse, json } from '@/server/http/respond';
import { listNonConversionDays } from '@/server/services/reference';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const env = getEnv();
    const pair = new URL(request.url).searchParams.get('pair') ?? '';
    return json(await listNonConversionDays({ env, paymentsGateway: env.PAYMENTS_GATEWAY }, pair));
  } catch (error) {
    return failureResponse(error);
  }
}
