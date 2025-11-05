import mongoose, { Schema, Model } from "mongoose";
import bcrypt from "bcrypt";

interface otpinterface extends Document {
  email: string;
  otp: string;
  attemps: number;
  lastAttempTime: Date;
  lock: boolean;
  resendCount: number;
  expireAt: Date;
  isPasswordCorrect(otp: string): Promise<boolean>;
}

const otpSchema = new Schema<otpinterface>({
  email: { type: String, required: true, unique: true, lowercase: true },
  otp: { type: String, required: true },
  attemps: { type: Number, default: 0 },
  lastAttempTime: { type: Date },
  lock: { type: Boolean, default: false },
  resendCount: { type: Number, default: 0 },
  expireAt: { type: Schema.Types.Date, required: true },
});
otpSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

otpSchema.pre("save", async function (next) {
  if (!this?.isModified("otp")) return next();
  this.otp = await bcrypt.hash(this.otp, 10);
  next();
});

otpSchema.methods.isPasswordCorrect = async function (
  otp: string
): Promise<boolean> {
  return await bcrypt.compare(otp, this.otp);
};
export const Otp = mongoose.model<otpinterface>("Otp", otpSchema);
