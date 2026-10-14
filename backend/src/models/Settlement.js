import mongoose from "mongoose";

// "Tôi đã chuyển": from báo đã chuyển `amount` cho to, để trả nợ của MỘT khoản chi (expenseId).
// pending -> to bấm "Đã nhận" (confirmed) hoặc "Chưa nhận được" (rejected).
// Chỉ khoản confirmed mới làm giảm nợ.
// expenseId có thể trống ở bản ghi cũ (trước khi nợ được tách theo từng khoản chi);
// các bản ghi cũ đó không còn được tính vào nợ của khoản chi nào.
const settlementSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    expenseId: { type: mongoose.Schema.Types.ObjectId, ref: "Expense" },
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: "amount phải là số nguyên" },
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "rejected"],
      default: "pending",
    },
    confirmedAt: { type: Date },
  },
  { timestamps: true }
);

settlementSchema.index({ conversationId: 1, status: 1 });
settlementSchema.index({ conversationId: 1, expenseId: 1 });

// Mỗi (khoản chi, người chuyển, người nhận) chỉ có tối đa 1 khoản đang chờ xác nhận,
// kể cả khi bấm 2 lần cùng lúc (chặn ở tầng database).
settlementSchema.index(
  { conversationId: 1, expenseId: 1, from: 1, to: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);

const Settlement = mongoose.model("Settlement", settlementSchema);

// Chỉ mục duy nhất cũ (conversationId + from + to) sẽ chặn việc báo chuyển cho 2 khoản chi khác
// nhau cùng lúc. syncIndexes xóa chỉ mục cũ không còn trong schema và tạo chỉ mục mới.
// Chạy 1 lần xong có thể xóa dòng này.
Settlement.syncIndexes().catch((error) => {
  console.error("Lỗi đồng bộ chỉ mục Settlement", error);
});

export default Settlement;