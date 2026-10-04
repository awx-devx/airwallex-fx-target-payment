import './register';
import { QUOTE_VALIDITIES } from '@/contracts/airwallex';
import { Schema, model, models } from 'mongoose';
import { collection } from '@/server/db/models/options';

const settingsSchema = new Schema(
  {
    _id: { type: String, default: 'global' },
    homeCurrency: { type: String, required: true },
    defaultLeadDays: { type: Number, required: true },
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
  collection('settings'),
);

export const Settings = models.Settings ?? model('Settings', settingsSchema);
