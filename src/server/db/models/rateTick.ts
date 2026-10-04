import './register';
import { RATE_SOURCES } from '@/contracts/sse';
import { Schema, model, models } from 'mongoose';

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

/**
 * Time field is `ts`. Mongoose timestamps would add a second clock the
 * collection does not use. TTL is applied again by `syncAllIndexes`.
 */
const rateTickSchema = new Schema(
  {
    ts: { type: Date, required: true },
    meta: {
      base: { type: String, required: true },
      quote: { type: String, required: true },
      billId: { type: Schema.Types.ObjectId, ref: 'Bill' },
      source: { type: String, enum: RATE_SOURCES, required: true },
      simId: { type: String },
    },
    price: { type: Schema.Types.Decimal128, required: true },
    raw: { type: Schema.Types.Mixed },
  },
  {
    collection: 'rate_ticks',
    timestamps: false,
    autoIndex: false,
    autoCreate: false,
    timeseries: {
      timeField: 'ts',
      metaField: 'meta',
      granularity: 'seconds',
    },
    expireAfterSeconds: THIRTY_DAYS_SECONDS,
  },
);

rateTickSchema.index({ 'meta.base': 1, 'meta.quote': 1, ts: 1 });

export const RateTick = models.RateTick ?? model('RateTick', rateTickSchema);
