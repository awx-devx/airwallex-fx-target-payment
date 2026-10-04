import './register';
import { Schema, model, models } from 'mongoose';
import { collection } from '@/server/db/models/options';

const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
  },
  collection('users'),
);

userSchema.index({ email: 1 }, { unique: true });

export const User = models.User ?? model('User', userSchema);
