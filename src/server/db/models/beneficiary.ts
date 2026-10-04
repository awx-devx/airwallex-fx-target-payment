import './register';
import {
  ACCOUNT_VERIFICATION_CODES,
  ENTITY_TYPES,
  NAME_MATCHES,
  TRANSFER_METHODS,
} from '@/contracts/airwallex';
import { Schema, model, models } from 'mongoose';
import { collection } from '@/server/db/models/options';

const beneficiarySchema = new Schema(
  {
    airwallexBeneficiaryId: { type: String, required: true },
    name: { type: String, required: true },
    entityType: { type: String, enum: ENTITY_TYPES, required: true },
    bankCountry: { type: String, required: true },
    accountCurrency: { type: String, required: true },
    bankName: { type: String },
    maskedAccount: { type: String, required: true },
    transferMethods: { type: [String], enum: TRANSFER_METHODS, required: true },
    verification: {
      type: new Schema(
        {
          code: {
            type: String,
            enum: ACCOUNT_VERIFICATION_CODES,
            required: true,
          },
          nameMatch: { type: String, enum: NAME_MATCHES },
          resolvedAccountName: { type: String },
          checkedAt: { type: Date, required: true },
        },
        { _id: false },
      ),
    },
    raw: { type: Schema.Types.Mixed },
  },
  collection('beneficiaries'),
);

beneficiarySchema.index({ airwallexBeneficiaryId: 1 }, { unique: true });

export const Beneficiary =
  models.Beneficiary ?? model('Beneficiary', beneficiarySchema);
