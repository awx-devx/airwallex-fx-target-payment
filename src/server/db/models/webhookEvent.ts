import './register';
import { Schema, model, models } from 'mongoose';

/**
 * `_id` is the Airwallex event id. `createdAt` is the provider timestamp,
 * not the insert time, so Mongoose timestamps stay off.
 */
const webhookEventSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    createdAt: { type: Date, required: true },
    receivedAt: { type: Date, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    processedAt: { type: Date },
    error: { type: String },
  },
  {
    collection: 'webhook_events',
    timestamps: false,
    autoIndex: false,
    autoCreate: false,
  },
);

export const WebhookEvent =
  models.WebhookEvent ?? model('WebhookEvent', webhookEventSchema);
