import { getEnv } from '@/server/env';
import { failureResponse, json } from '@/server/http/respond';
import { validateBeneficiaryBody } from '@/server/services/beneficiaries';
import { invalid } from '@/server/services/errors';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('Request body must be an object');
    return json(await validateBeneficiaryBody(getEnv(), body as Record<string, unknown>));
  } catch (error) {
    return failureResponse(error);
  }
}
