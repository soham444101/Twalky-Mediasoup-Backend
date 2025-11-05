import { model, Schema, Document } from "mongoose";
import jwt, { Secret, SignOptions } from "jsonwebtoken";

interface IUser extends Document {
  uid: string;
  email: string;
  username: string;
  photo?: string;
  color:string,
  device?: Array<{
    refreshToken: string;
    deviceId: string;
    fcmToken?: string;
    lastActive: number;
    platform: "ios" | "android";
  }>;
  GenerateAccesToken: () => string;
  GenerateRefreshToken: () => string;
}

const userSchema = new Schema<IUser>(
  {
    uid: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    username: { type: String, required: true },
    photo: { type: String, default: "" },
    color: { type: String, default: "#79716b" },
    device: [
      {
        refreshToken: { type: String },
        deviceId: { type: String, require: true },
        fcmToken: { type: String },
        lastActive: { type: Date, default: Date.now() },
        platform: { type: String, enum: ["ios", "android"] },
      },
    ],
  },
  { timestamps: true }
);

// Access Token
userSchema.methods.GenerateAccesToken = function (): string {
  if (!process.env.ACCESS_TOKEN_SECRET) {
    throw new Error("ACCESS_TOKEN_SECRET is not defined");
  }

  const options: SignOptions = {
    expiresIn: (process.env.ACCESS_TOKEN_EXPIRY || "30m") as any,
  };

  return jwt.sign(
    { uid: this.uid, username: this.username},
    process.env.ACCESS_TOKEN_SECRET as Secret,
    options
  );
};

// Refresh Token
userSchema.methods.GenerateRefreshToken = function (): string {
  if (!process.env.REFRESH_TOKEN_SECRET) {
    throw new Error("REFRESH_TOKEN_SECRET is not defined");
  }

  const options: SignOptions = {
    expiresIn: (process.env.REFRESH_TOKEN_EXPIRY || "30d") as any,
  };

  return jwt.sign(
    { uid: this.uid },
    process.env.REFRESH_TOKEN_SECRET as Secret,
    options
  );
};


export const User = model<IUser>("User", userSchema);
