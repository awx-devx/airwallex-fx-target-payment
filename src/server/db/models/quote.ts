import './register';
import { QUOTE_VALIDITIES } from '@/contracts/airwallex';
import { Schema, model, models } from 'mongoose';
import { collection } from '@/server/db/models/options';

export const QUOTE_PURPOSES = [
  'TARGET',
  'DEADLINE',
  'AUTOSETTLE',
  'MANUAL',
] as const;

const quoteSchema = new Schema(
  {
    billId: { type: Schema.Types.ObjectId, ref: 'Bill', required: true },
    airwallexQuoteId: { type: String, required: true },
    purpose: { type: String, enum: QUOTE_PURPOSES, required: true },
    validity: { type: String, enum: QUOTE_VALIDITIES, required: true },
    usage: { type: String, enum: ['SINGLE_USE', 'MULTI_USE'], required: true },
    currencyPair: { type: String, required: true },
    conversionDate: { type: Date, required: true },
    price: { type: Schema.Types.Decimal128, required: true },
    clientRate: { type: Schema.Types.Decimal128, required: true },
    awxRate: { type: Schema.Types.Decimal128 },
    midRate: { type: Schema.Types.Decimal128 },
    buyAmount: { type: Schema.Types.Decimal128, required: true },
    sellAmount: { type: Schema.Types.Decimal128, required: true },
    validFromAt: { type: Date, required: true },
    validToAt: { type: Date, required: true },
    raw: { type: Schema.Types.Mixed },
  },
  collection('quotes'),
);

quoteSchema.index({ airwallexQuoteId: 1 }, { unique: true });

export const Quote = models.Quote ?? model('Quote', quoteSchema);
