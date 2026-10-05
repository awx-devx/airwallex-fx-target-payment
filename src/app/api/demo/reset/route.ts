import { getEnv } from '@/server/env';
import { failureResponse, json } from '@/server/http/respond';
import { resetDemo } from '@/server/services/demo';

export const runtime = 'nodejs';

export async function POST(): Promise<Response> {
  try {
    return json(await resetDemo({ env: getEnv() }));
  } catch (error) {
    return failureResponse(error);
  }
}
