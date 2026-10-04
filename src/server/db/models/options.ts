import type { SchemaOptions } from 'mongoose';

export function collection(name: string, extra?: SchemaOptions): SchemaOptions {
  return {
    collection: name,
    timestamps: true,
    autoIndex: false,
    autoCreate: false,
    ...extra,
  };
}
