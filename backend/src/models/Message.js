import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      trim: true,
    },
    imgUrl: {
      type: String,
    },
    // "text" (mặc định, tin nhắn thường) | "call" (log cuộc gọi)
    type: {
      type: String,
      enum: ["text", "call"],
      default: "text",
    },
    // chỉ có giá trị khi type = "call"
    callInfo: {
      callId: { type: String },
      callType: { type: String, enum: ["audio", "video"] },
      status: {
        type: String,
        enum: ["completed", "missed", "rejected", "cancelled"],
      },
      // luôn là người bấm gọi (trùng với senderId của message này)
      callerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      calleeId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      durationInSeconds: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });

const Message = mongoose.model("Message", messageSchema);

export default Message;