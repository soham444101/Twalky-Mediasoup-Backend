import { model, Schema } from "mongoose";

const roomSchema = new Schema({
  roomId: { type: String, required: true, unique: true },
  participants: [
    {
      uid: { type: String, required: true},
      username: { type: String, required: true },
      // socketId: { type: String, required: true },
      // micOn: { type: Boolean, default: false },
      // videOn: { type: Boolean, default: false },
      // isAdmin : {type:Boolean , default:false},
      photo: { type: String, default: "" },
      color: { type: String, default: "#79716b" },
      joinedAt: { type: Date, default: Date.now() },
      leftat: { type: Date },
    },
  ],
  owner: { type: String, required: true},
  // Optimization Here see
  createdAt: {
    type: Date,
    default: Date.now,
    expires: "2d",
  },
});

export const Room = model("Room", roomSchema);
