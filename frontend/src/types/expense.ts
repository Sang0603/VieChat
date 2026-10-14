// Kiểu dữ liệu cho tính năng chia tiền trong nhóm.

// Chi cho việc gì. Giá trị (value) khớp với danh sách ở backend/src/models/Expense.js
export const EXPENSE_CATEGORIES = [
  { value: "food", label: "Ăn uống" },
  { value: "transport", label: "Di chuyển" },
  { value: "lodging", label: "Chỗ ở" },
  { value: "shopping", label: "Mua sắm" },
  { value: "fun", label: "Vui chơi" },
  { value: "other", label: "Khác" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["value"];

export const getCategoryLabel = (category?: ExpenseCategory) =>
  EXPENSE_CATEGORIES.find((c) => c.value === category)?.label ?? "Khác";

// Người dùng gõ nội dung chi tự do. Nếu gõ đúng tên một loại có sẵn (vd "Ăn uống")
// thì lấy loại đó (để hiện đúng biểu tượng), còn lại coi là "Khác".
export const getCategoryFromText = (text: string): ExpenseCategory => {
  const t = text.trim().toLowerCase();
  return EXPENSE_CATEGORIES.find((c) => c.label.toLowerCase() === t)?.value ?? "other";
};

export interface ExpenseParticipant {
  userId: string;
  share: number; // phần phải chịu, số nguyên VND
}

// 1 người đã chi bao nhiêu, và chi cho việc gì, trong 1 khoản chi (có thể nhiều người cùng chi)
export interface ExpensePayment {
  userId: string;
  amount: number; // số nguyên VND
  category?: ExpenseCategory; // khoản chi cũ chưa có thì lấy theo loại chung của khoản chi
  purpose?: string; // nội dung chi người dùng tự gõ (có thể trống)
}

// Nội dung hiển thị của 1 khoản người chi: chữ người dùng gõ, nếu trống thì dùng tên loại chi
export const getPaymentPurpose = (p: ExpensePayment) =>
  p.purpose?.trim() || getCategoryLabel(p.category);

export interface Expense {
  _id: string;
  conversationId: string;
  title: string;
  category?: ExpenseCategory; // loại chi chính của cả khoản (khoản chi cũ chưa có thì coi là "other")
  amount: number; // tổng số tiền = tổng số tiền mỗi người đã chi
  payments?: ExpensePayment[]; // ai đã chi bao nhiêu; khoản chi cũ chưa có thì chỉ có paidBy
  paidBy?: string; // chỉ có ở khoản chi cũ (1 người chi hết)
  splitType: "equal" | "custom";
  participants: ExpenseParticipant[];
  createdBy: string;
  createdAt: string;
}

// Danh sách "ai đã chi bao nhiêu, cho việc gì" của 1 khoản chi, kể cả khoản chi cũ.
// Người nào chưa có loại chi riêng thì lấy loại chung của khoản chi.
export const getExpensePayments = (e: Expense): ExpensePayment[] => {
  const list: ExpensePayment[] =
    e.payments && e.payments.length > 0
      ? e.payments
      : e.paidBy
        ? [{ userId: e.paidBy, amount: e.amount }]
        : [];

  return list.map((p) => ({ ...p, category: p.category ?? e.category ?? "other" }));
};

// net > 0: được nhận lại, net < 0: còn nợ (cộng dồn mọi khoản chi)
export interface Balance {
  userId: string;
  net: number;
}

// 1 lần chuyển khoản cần làm để trả nợ của MỘT khoản chi (expenseId)
export interface Transfer {
  from: string;
  to: string;
  amount: number;
  expenseId: string;
}

export type SettlementStatus = "pending" | "confirmed" | "rejected";

// "Tôi đã chuyển": pending -> người nhận bấm "Đã nhận" (confirmed) hoặc "Chưa nhận được" (rejected)
export interface Settlement {
  _id: string;
  conversationId: string;
  expenseId?: string; // khoản chi mà lần chuyển này trả nợ
  from: string;
  to: string;
  amount: number;
  status: SettlementStatus;
  createdAt: string;
}

export interface BalancesResponse {
  balances: Balance[];
  transfers: Transfer[];
  pendingSettlements: Settlement[];
}

// Tổng số tiền do server tự cộng từ payments nên không gửi `amount`.
// Loại chi và nội dung chi nằm trong từng payment; `category` chung chỉ còn để tương thích bản cũ.
export interface NewExpensePayload {
  title: string;
  category?: ExpenseCategory;
  payments: ExpensePayment[];
  splitType: "equal" | "custom";
  participants: ExpenseParticipant[];
}