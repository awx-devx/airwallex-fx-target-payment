import './register';
import {
  QUOTE_VALIDITIES,
  TRANSFER_METHODS,
  TRANSFER_REASONS,
} from '@/contracts/airwallex';
import { BILL_STATES } from '@/contracts/bill';
import { BILL_EVENT_TYPES } from '@/contracts/events';
import { RATE_SOURCES } from '@/contracts/sse';
import { SIMULATION_OUTCOMES } from '@/server/domain/simulation';
import { Schema, model, models } from 'mongoose';
import { collection } from '@/server/db/models/options';

const recentEventSchema = new Schema(
  {
    ts: { type: Date, required: true },
    type: { type: String, enum: BILL_EVENT_TYPES, required: true },
    actor: { type: String, required: true },
    payload: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const strategySchema = new Schema(
  {
    mode: { type: String, enum: ['TARGET_RATE', 'MAX_COST'], required: true },
    targetPrice: { type: Schema.Types.Decimal128, required: true },
    maxCost: { type: Schema.Types.Decimal128 },
    feeEstimate: { type: Schema.Types.Decimal128, required: true },
    bufferBps: { type: Number, required: true },
    confirmTicks: { type: Number, required: true },
    quoteValidityTarget: {
      type: String,
      enum: QUOTE_VALIDITIES,
      required: true,
    },
    quoteValidityDeadline: {
      type: String,
      enum: QUOTE_VALIDITIES,
      required: true,
    },
    autosettleCutoff: { type: String, required: true },
  },
  { _id: false },
);

const billSchema = new Schema(
  {
    state: { type: String, enum: BILL_STATES, required: true },
    vendorName: { type: String, required: true },
    invoiceNumber: { type: String, required: true },
    billCurrency: { type: String, required: true },
    billAmount: { type: Schema.Types.Decimal128, required: true },
    homeCurrency: { type: String, required: true },
    issuedDate: { type: Date },
    dueDate: { type: Date, required: true },
    executionDeadline: { type: Date, required: true },
    transferMethod: { type: String, enum: TRANSFER_METHODS, required: true },
    leadDays: { type: Number, required: true },
    beneficiaryId: { type: Schema.Types.ObjectId, ref: 'Beneficiary' },
    reference: { type: String },
    transferReason: {
      type: String,
      enum: TRANSFER_REASONS,
      required: true,
      default: 'bill_payment',
    },
    entry: {
      type: new Schema(
        {
          price: { type: Schema.Types.Decimal128, required: true },
          at: { type: Date, required: true },
        },
        { _id: false },
      ),
    },
    standingInstruction: {
      type: new Schema(
        {
          at: { type: Date, required: true },
          by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        },
        { _id: false },
      ),
    },
    strategy: { type: strategySchema },
    timers: {
      type: new Schema(
        {
          autosettleAt: { type: Date },
          autosettleFiredAt: { type: Date },
          cooldownUntil: { type: Date },
          nearMissPrice: { type: Schema.Types.Decimal128 },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    trigger: {
      type: new Schema(
        {
          consecutiveHits: { type: Number, required: true, default: 0 },
          lastEvaluatedTickAt: { type: Date },
        },
        { _id: false },
      ),
      default: () => ({ consecutiveHits: 0 }),
    },
    last: {
      type: new Schema(
        {
          price: { type: Schema.Types.Decimal128, required: true },
          at: { type: Date, required: true },
          source: { type: String, enum: RATE_SOURCES, required: true },
        },
        { _id: false },
      ),
    },
    activeExecutionId: { type: Schema.Types.ObjectId, ref: 'Execution' },
    recentEvents: { type: [recentEventSchema], default: [] },
    displayInverted: { type: Boolean, required: true, default: false },
    insufficientBalance: { type: Boolean, default: false },
    safetyNet: {
      type: new Schema(
        { transferId: { type: String, required: true } },
        { _id: false },
      ),
    },
    simulation: {
      type: new Schema(
        {
          simId: { type: String, required: true },
          startedAt: { type: Date, required: true },
          outcome: { type: String, enum: SIMULATION_OUTCOMES, required: true },
        },
        { _id: false },
      ),
    },
    colorTag: { type: String },
    seedKey: { type: String },
    generated: { type: Boolean },
  },
  collection('bills', {
    versionKey: 'version',
    optimisticConcurrency: true,
  }),
);

billSchema.index({ state: 1, 'timers.autosettleAt': 1 });
billSchema.index({ state: 1, billCurrency: 1, homeCurrency: 1 });
billSchema.index({ vendorName: 1, invoiceNumber: 1 });
billSchema.index({ seedKey: 1 }, { unique: true, sparse: true });

export const Bill = models.Bill ?? model('Bill', billSchema);
