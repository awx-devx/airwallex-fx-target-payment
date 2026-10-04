import './register';
import { Schema, model, models } from 'mongoose';
import { collection } from '@/server/db/models/options';

const rateCandleSchema = new Schema(
  {
    base: { type: String, required: true },
    quote: { type: String, required: true },
    t: { type: Date, required: true },
    o: { type: Schema.Types.Decimal128, required: true },
    h: { type: Schema.Types.Decimal128, required: true },
    l: { type: Schema.Types.Decimal128, required: true },
    c: { type: Schema.Types.Decimal128, required: true },
  },
  collection('rate_candles_1m'),
);

rateCandleSchema.index({ base: 1, quote: 1, t: 1 }, { unique: true });

export const RateCandle =
  models.RateCandle ?? model('RateCandle', rateCandleSchema);
