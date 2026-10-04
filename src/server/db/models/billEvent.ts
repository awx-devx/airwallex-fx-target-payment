import './register';
import { BILL_EVENT_TYPES } from '@/contracts/events';
import { Schema, model, models } from 'mongoose';
import { collection } from '@/server/db/models/options';

const billEventSchema = new Schema(
  {
    billId: { type: Schema.Types.ObjectId, ref: 'Bill', required: true },
    ts: { type: Date, required: true },
    type: { type: String, enum: BILL_EVENT_TYPES, required: true },
    actor: { type: String, required: true },
    payload: { type: Schema.Types.Mixed },
  },
  collection('bill_events'),
);

billEventSchema.index({ billId: 1, ts: -1 });

export const BillEvent =
  models.BillEvent ?? model('BillEvent', billEventSchema);
