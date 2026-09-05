import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    hashedPassword: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    avatarUrl: {
      type: String,
    },
    avatarId: {
      type: String,
    },
    bio: {
      type: String,
      maxlength: 500,
    },
    phone: {
      type: String,
      sparse: true,
    },
    gender: {
      type: String,
      enum: ["Nam", "Nữ", "Khác"],
    },
    dateOfBirth: {
      type: Date,
    },
    privacy: {
      showPhone: { type: Boolean, default: true },
      showDateOfBirth: { type: Boolean, default: true },
      // 👇 MỚI THÊM: nếu bật, người CHƯA kết bạn sẽ không thể nhắn tin cho
      // mình. Mặc định false -> giống Zalo, người lạ vẫn nhắn được trừ khi
      // mình chủ động chặn.
      blockStrangerMessages: { type: Boolean, default: false },
    },
    // 👇 MỚI THÊM: phân quyền
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);
export default User;