import { entityTypeSchema, transferMethodSchema } from '@/contracts/airwallex';
import { getEnv } from '@/server/env';
import { failureResponse, json } from '@/server/http/respond';
import { ServiceError } from '@/server/services/errors';
import { bankSearch } from '@/server/services/beneficiaries';
import { z } from 'zod';

export const runtime = 'nodejs';

const querySchema = z.object({
  accountCurrency: z.string().length(3),
  bankCountryCode: z.string().length(2),
  entityType: entityTypeSchema,
  transferMethod: transferMethodSchema,
  keyword: z.string().optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      accountCurrency: url.searchParams.get('accountCurrency') ?? undefined,
      bankCountryCode: url.searchParams.get('bankCountryCode') ?? undefined,
      entityType: url.searchParams.get('entityType') ?? undefined,
      transferMethod: url.searchParams.get('transferMethod') ?? undefined,
      keyword: url.searchParams.get('keyword') ?? undefined,
    });
    if (!parsed.success) {
      throw new ServiceError('VALIDATION_FAILED', parsed.error.issues[0]?.message ?? 'Invalid query', 400);
    }
    return json(await bankSearch(getEnv(), parsed.data));
  } catch (error) {
    return failureResponse(error);
  }
}
