import { beneficiarySchemaBodySchema } from '@/contracts/api';
import { getEnv } from '@/server/env';
import { failureResponse, json, parseBody } from '@/server/http/respond';
import { formSchema } from '@/server/services/beneficiaries';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await parseBody(request, beneficiarySchemaBodySchema);
    return json(await formSchema(getEnv(), body));
  } catch (error) {
    return failureResponse(error);
  }
}
