import { armBodySchema, validateTransferResponseSchema } from '@/contracts/api';
import { getEnv } from '@/server/env';
import { failureResponse, json, parseBody } from '@/server/http/respond';
import { billContext } from '@/server/services/bills';
import { transferFieldErrors } from '@/server/services/transferValidation';
import { Bill } from '@/server/db/models';
import { notFound } from '@/server/services/errors';
import mongoose from 'mongoose';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) throw notFound();
    const bill = await Bill.findById(id);
    if (!bill) throw notFound();
    const body = await parseBody(request, armBodySchema);
    const fieldErrors = await transferFieldErrors(billContext(getEnv()), bill, body);
    return json(validateTransferResponseSchema.parse({ fieldErrors }));
  } catch (error) {
    return failureResponse(error);
  }
}
