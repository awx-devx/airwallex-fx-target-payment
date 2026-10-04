import { quotaQuerySchema } from '@/contracts/api';
import { getEnv } from '@/server/env';
import { failureResponse, json } from '@/server/http/respond';
import { ServiceError } from '@/server/services/errors';
import { readQuota } from '@/server/services/reference';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const parsed = quotaQuerySchema.safeParse({
      type: new URL(request.url).searchParams.get('type') ?? undefined,
    });
    if (!parsed.success) {
      throw new ServiceError('VALIDATION_FAILED', parsed.error.issues[0]?.message ?? 'Invalid query', 400);
    }
    const env = getEnv();
    return json(await readQuota({ env, paymentsGateway: env.PAYMENTS_GATEWAY }, parsed.data.type));
  } catch (error) {
    return failureResponse(error);
  }
}
