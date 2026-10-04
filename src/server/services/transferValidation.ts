import type { ArmBody } from '@/contracts/api';
import type { FieldError } from '@/contracts/airwallex';
import { decimalString } from '@/contracts/money';
import { validateTransfer } from '@/server/adapters/airwallex/endpoints/transfers';
import { AirwallexError } from '@/server/adapters/airwallex/errors';
import { fromDecimal128 } from '@/server/db/decimal';
import { Beneficiary } from '@/server/db/models';
import type { Env } from '@/server/env';
import { requireAirwallex } from '@/server/services/airwallexClient';
import { invalid, ServiceError } from '@/server/services/errors';

interface GatewayContext {
  env: Env;
  paymentsGateway: Env['PAYMENTS_GATEWAY'];
}

type ArmedBill = {
  _id: { toString(): string };
  beneficiaryId?: { toString(): string } | null;
  billCurrency: string;
  billAmount: { toString(): string };
  homeCurrency: string;
};

/** Dry-run the standing instruction. The mock gateway has nothing to validate. */
export async function assertTransferValid(ctx: GatewayContext, bill: ArmedBill, body: ArmBody): Promise<void> {
  const fieldErrors = await transferFieldErrors(ctx, bill, body);
  if (fieldErrors.length > 0) {
    throw new ServiceError('VALIDATION_FAILED', 'Transfer validation failed', 400, fieldErrors);
  }
}

export async function transferFieldErrors(
  ctx: GatewayContext,
  bill: ArmedBill,
  body: ArmBody,
): Promise<FieldError[]> {
  if (ctx.paymentsGateway === 'mock') return [];
  if (!bill.beneficiaryId) throw invalid('Resolve a beneficiary before arming');
  const beneficiary = await Beneficiary.findById(bill.beneficiaryId).lean();
  if (!beneficiary) throw invalid('Resolve a beneficiary before arming');
  try {
    await validateTransfer(requireAirwallex(ctx.env), {
      billId: String(bill._id),
      beneficiaryId: beneficiary.airwallexBeneficiaryId,
      transferCurrency: bill.billCurrency,
      transferAmount: decimalString(fromDecimal128(bill.billAmount)),
      sourceCurrency: bill.homeCurrency,
      transferMethod: body.transferMethod,
      reason: body.transferReason,
      reference: body.reference,
    });
    return [];
  } catch (error) {
    if (error instanceof AirwallexError) return error.fieldErrors ?? [];
    throw error;
  }
}
