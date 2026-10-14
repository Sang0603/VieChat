import mongoose from "mongoose";

// Chi cho việc gì. Giữ khớp với danh sách ở frontend/src/types/expense.ts
export const EXPENSE_CATEGORIES = ["food", "transport", "lodging", "shopping", "fun", "other"];

// 1 khoản chi chung của nhóm. Tiền luôn là số nguyên VND.
// - payments: ai đã chi bao nhiêu và chi cho việc gì (có thể nhiều người cùng chi)
//   + purpose: nội dung người đó tự gõ (vd "Ăn tối nhà hàng A")
//   + category: loại chi gần nhất với nội dung đó, dùng để chọn biểu tượng
// - participants: ai cùng chia và phần mỗi người phải chịu (share)
// - amount: tổng số tiền = tổng các payments = tổng các share
// - category: loại chi chính của cả khoản (lấy theo người chi nhiều nhất), dùng cho biểu tượng
// share của từng người được lưu sẵn lúc tạo (không tính lại sau này) nên
// lịch sử không bị đổi khi nhóm có người vào ra.
const paymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: "amount phải là số nguyên" },
    },
    // loại chi của riêng khoản người này chi
    category: { type: String, enum: EXPENSE_CATEGORIES, default: "other" },
    // nội dung chi do người dùng tự gõ (có thể để trống)
    purpose: { type: String, trim: true, maxlength: 50, default: "" },
  },
  { _id: false }
);

const participantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    share: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: "share phải là số nguyên" },
    },
  },
  { _id: false }
);

const expenseSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    category: { type: String, enum: EXPENSE_CATEGORIES, default: "other" },
    amount: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: "amount phải là số nguyên" },
    },
    // chỉ có ở khoản chi cũ (1 người chi hết); khoản chi mới dùng payments
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    payments: { type: [paymentSchema], default: [] },
    splitType: { type: String, enum: ["equal", "custom"], default: "equal" },
    participants: { type: [participantSchema], required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

expenseSchema.index({ conversationId: 1, createdAt: -1 });

const Expense = mongoose.model("Expense", expenseSchema);
export default Expense;