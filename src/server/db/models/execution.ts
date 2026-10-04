import './register';
import {
  FAILURE_CATEGORIES,
  FUNDING_STATUSES,
  TRANSFER_STATUSES,
} from '@/contracts/airwallex';
import { Schema, model, models } from 'mongoose';
import { collection } from '@/server/db/models/options';

export const EXECUTION_MODES = ['TARGET', 'DEADLINE', 'MANUAL'] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];

const executionSchema = new Schema(
  {
    billId: { type: Schema.Types.ObjectId, ref: 'Bill', required: true },
    mode: { type: String, enum: EXECUTION_MODES, required: true },
    attempt: { type: Number, required: true },
    requestId: { type: String, required: true },
    active: { type: Boolean, required: true },
    airwallexTransferId: { type: String },
    shortReferenceId: { type: String },
    transferStatus: { type: String, enum: TRANSFER_STATUSES },
    fundingStatus: { type: String, enum: FUNDING_STATUSES },
    statusUpdatedAt: { type: Date },
    awxUpdatedAt: { type: Date },
    conversionRate: { type: Schema.Types.Decimal128 },
    sourceAmount: { type: Schema.Types.Decimal128 },
    amountPayerPays: { type: Schema.Types.Decimal128 },
    amountBeneficiaryReceives: { type: Schema.Types.Decimal128 },
    feeAmount: { type: Schema.Types.Decimal128 },
    feeCurrency: { type: String },
    feePaidBy: { type: String, enum: ['PAYER', 'BENEFICIARY'] },
    swiftChargeOption: { type: String, enum: ['SHARED', 'PAYER'] },
    dispatchDate: { type: Date },
    lateFailureWatchUntil: { type: Date },
    failure: {
      type: new Schema(
        {
          code: { type: String },
          message: { type: String },
          reasonCodes: { type: [String] },
          category: { type: String, enum: FAILURE_CATEGORIES },
        },
        { _id: false },
      ),
    },
    raw: { type: Schema.Types.Mixed },
  },
  collection('executions'),
);

executionSchema.index({ requestId: 1 }, { unique: true });
executionSchema.index(
  { billId: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);
executionSchema.index(
  { airwallexTransferId: 1 },
  { unique: true, sparse: true },
);

export const Execution =
  models.Execution ?? model('Execution', executionSchema);
