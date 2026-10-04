import { listBillsQuerySchema } from '@/contracts/api';
import { getEnv } from '@/server/env';
import { failureResponse, json } from '@/server/http/respond';
import { ServiceError } from '@/server/services/errors';
import { listBillSummaries } from '@/server/services/bills';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const parsed = listBillsQuerySchema.safeParse({
      state: url.searchParams.get('state') ?? undefined,
      base: url.searchParams.get('base') ?? undefined,
      quote: url.searchParams.get('quote') ?? undefined,
    });
    if (!parsed.success) {
      throw new ServiceError('VALIDATION_FAILED', parsed.error.issues[0]?.message ?? 'Invalid query', 400);
    }
    return json(await listBillSummaries(parsed.data, getEnv().DEMO_MODE));
  } catch (error) {
    return failureResponse(error);
  }
}
