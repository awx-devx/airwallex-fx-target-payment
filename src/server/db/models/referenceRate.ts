import './register';
import { Schema, model, models } from 'mongoose';
import { collection } from '@/server/db/models/options';

const referenceRateSchema = new Schema(
  {
    base: { type: String, required: true },
    quote: { type: String, required: true },
    date: { type: Date, required: true },
    mid: { type: Schema.Types.Decimal128, required: true },
    source: { type: String, enum: ['FRANKFURTER', 'ECB'], required: true },
  },
  collection('reference_rates'),
);

referenceRateSchema.index(
  { base: 1, quote: 1, date: 1, source: 1 },
  { unique: true },
);

export const ReferenceRate =
  models.ReferenceRate ?? model('ReferenceRate', referenceRateSchema);
