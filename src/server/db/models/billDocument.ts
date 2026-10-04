import './register';
import { Schema, model, models } from 'mongoose';
import { collection } from '@/server/db/models/options';

const billDocumentSchema = new Schema(
  {
    billId: { type: Schema.Types.ObjectId, ref: 'Bill', required: true },
    filename: { type: String, required: true },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    sha256: { type: String, required: true },
    storageKey: { type: String, required: true },
    airwallexFileId: { type: String },
    extraction: {
      type: new Schema(
        {
          status: {
            type: String,
            enum: ['PENDING', 'RUNNING', 'DONE', 'FAILED'],
            required: true,
          },
          result: { type: Schema.Types.Mixed },
          error: { type: String },
        },
        { _id: false },
      ),
      required: true,
    },
  },
  collection('bill_documents'),
);

billDocumentSchema.index({ billId: 1 });
billDocumentSchema.index({ sha256: 1 });

export const BillDocument =
  models.BillDocument ?? model('BillDocument', billDocumentSchema);
