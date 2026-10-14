import { create } from "zustand";
import { toast } from "sonner";
import { expenseService } from "@/services/expenseService";
import type {
  Balance,
  Expense,
  NewExpensePayload,
  Settlement,
  Transfer,
} from "@/types/expense";

export interface ConversationExpenses {
  loaded: boolean;
  expenses: Expense[];
  balances: Balance[];
  transfers: Transfer[];
  pendingSettlements: Settlement[];
}

export const EMPTY_EXPENSES: ConversationExpenses = {
  loaded: false,
  expenses: [],
  balances: [],
  transfers: [],
  pendingSettlements: [],
};

// 🆕 MỚI THÊM: yêu cầu mở bảng Chi tiêu + xem chi tiết 1 khoản chi (từ thẻ trong khung chat)
export interface PendingOpen {
  conversationId: string;
  expenseId: string;
}

interface ExpenseState {
  byConversation: Record<string, ConversationExpenses>;
  // 🆕 MỚI THÊM
  pendingOpen: PendingOpen | null;
  requestOpen: (conversationId: string, expenseId: string) => void;
  clearPendingOpen: () => void;
  // tải khoản chi + số dư của 1 nhóm (gọi khi mở bảng Chi tiêu)
  fetchAll: (conversationId: string) => Promise<void>;
  // tải lại khi nhận socket "expense-updated" - bỏ qua nếu chưa từng mở bảng Chi tiêu của nhóm đó
  refresh: (conversationId: string) => Promise<void>;
  addExpense: (conversationId: string, payload: NewExpensePayload) => Promise<boolean>;
  removeExpense: (conversationId: string, expenseId: string) => Promise<boolean>;
  // báo đã chuyển tiền để trả nợ của 1 khoản chi (expenseId)
  reportPaid: (
    conversationId: string,
    to: string,
    amount: number,
    expenseId: string
  ) => Promise<boolean>;
  confirmSettlement: (conversationId: string, settlementId: string) => Promise<boolean>;
  rejectSettlement: (conversationId: string, settlementId: string) => Promise<boolean>;
}

const getMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } })?.response?.data
    ?.message ?? fallback;

export const useExpenseStore = create<ExpenseState>((set, get) => {
  // chạy 1 thao tác ghi, xong thì tải lại dữ liệu; báo lỗi bằng toast, trả về true/false
  const mutate = async (
    conversationId: string,
    action: () => Promise<unknown>,
    errorFallback: string
  ) => {
    try {
      await action();
    } catch (error) {
      toast.error(getMessage(error, errorFallback));
      return false;
    }
    await get().fetchAll(conversationId);
    return true;
  };

  return {
    byConversation: {},

    // 🆕 MỚI THÊM
    pendingOpen: null,
    requestOpen: (conversationId, expenseId) =>
      set({ pendingOpen: { conversationId, expenseId } }),
    clearPendingOpen: () => set({ pendingOpen: null }),

    fetchAll: async (conversationId) => {
      try {
        const [expenses, balances] = await Promise.all([
          expenseService.getExpenses(conversationId),
          expenseService.getBalances(conversationId),
        ]);

        set((state) => ({
          byConversation: {
            ...state.byConversation,
            [conversationId]: { loaded: true, expenses, ...balances },
          },
        }));
      } catch (error) {
        console.error("Lỗi xảy ra khi tải dữ liệu chi tiêu", error);
        if (!get().byConversation[conversationId]?.loaded) {
          toast.error(getMessage(error, "Không tải được dữ liệu chi tiêu"));
        }
      }
    },

    refresh: async (conversationId) => {
      if (!get().byConversation[conversationId]?.loaded) return;
      await get().fetchAll(conversationId);
    },

    addExpense: (conversationId, payload) =>
      mutate(
        conversationId,
        () => expenseService.createExpense(conversationId, payload),
        "Không thêm được khoản chi. Hãy thử lại!"
      ),

    removeExpense: (conversationId, expenseId) =>
      mutate(
        conversationId,
        () => expenseService.deleteExpense(conversationId, expenseId),
        "Không xóa được khoản chi. Hãy thử lại!"
      ),

    reportPaid: (conversationId, to, amount, expenseId) =>
      mutate(
        conversationId,
        () => expenseService.createSettlement(conversationId, to, amount, expenseId),
        "Không gửi được thông báo đã chuyển. Hãy thử lại!"
      ),

    confirmSettlement: (conversationId, settlementId) =>
      mutate(
        conversationId,
        () => expenseService.confirmSettlement(conversationId, settlementId),
        "Không xác nhận được. Hãy thử lại!"
      ),

    rejectSettlement: (conversationId, settlementId) =>
      mutate(
        conversationId,
        () => expenseService.rejectSettlement(conversationId, settlementId),
        "Không cập nhật được. Hãy thử lại!"
      ),
  };
});