import { Schema, model, Document, Model } from 'mongoose';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  name?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserResponse {
  id: string;
  email: string;
  name?: string | null;
  createdAt: string;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false // Never return password hash in regular queries
    },
    name: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null
    }
  },
  {
    timestamps: true
  }
);

export const UserModel: Model<IUser> = model<IUser>('User', userSchema);
