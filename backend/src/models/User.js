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
      // tài khoản đăng nhập bằng Google sẽ không có password
      required: false,
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
      blockStrangerMessages: { type: Boolean, default: false },
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    // 👇 MỚI THÊM: đăng nhập bằng Google
    googleId: {
      type: String,
      unique: true,
      sparse: true, // cho phép nhiều user không có googleId (null) mà không lỗi unique
    },
    // 👇 MỚI THÊM: biết tài khoản được tạo từ đâu (chỉ để tham khảo/hiển thị)
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },
    // 👇 MỚI THÊM: tài khoản nhận tiền (dùng tạo mã VietQR khi chia tiền nhóm).
    // select:false => mọi truy vấn bình thường (me, bạn bè, tìm kiếm...) KHÔNG
    // bao giờ trả trường này ra; chỉ lấy khi chủ động select("+bankInfo").
    bankInfo: {
      type: new mongoose.Schema(
        {
          bankId: { type: String, trim: true }, // mã BIN ngân hàng (6 số)
          accountNo: { type: String, trim: true },
          accountName: { type: String, trim: true },
        },
        { _id: false }
      ),
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);
export default User;