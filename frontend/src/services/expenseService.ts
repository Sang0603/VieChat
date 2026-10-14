import api from "@/lib/axios";
import type { BankInfo } from "@/services/bankService";
import type {
  BalancesResponse,
  Expense,
  NewExpensePayload,
  Settlement,
} from "@/types/expense";

export const expenseService = {
  async getExpenses(conversationId: string): Promise<Expense[]> {
    const res = await api.get(`/conversations/${conversationId}/expenses`);
    return res.data.expenses ?? [];
  },

  async createExpense(conversationId: string, payload: NewExpensePayload): Promise<Expense> {
    const res = await api.post(`/conversations/${conversationId}/expenses`, payload);
    return res.data.expense;
  },

  async deleteExpense(conversationId: string, expenseId: string) {
    await api.delete(`/conversations/${conversationId}/expenses/${expenseId}`);
  },

  async getBalances(conversationId: string): Promise<BalancesResponse> {
    const res = await api.get(`/conversations/${conversationId}/balances`);
    return {
      balances: res.data.balances ?? [],
      transfers: res.data.transfers ?? [],
      pendingSettlements: res.data.pendingSettlements ?? [],
    };
  },

  // "Tôi đã chuyển" (trả nợ cho 1 khoản chi)
  async createSettlement(
    conversationId: string,
    to: string,
    amount: number,
    expenseId: string
  ): Promise<Settlement> {
    const res = await api.post(`/conversations/${conversationId}/settlements`, {
      to,
      amount,
      expenseId,
    });
    return res.data.settlement;
  },

  // "Đã nhận"
  async confirmSettlement(conversationId: string, settlementId: string) {
    await api.patch(`/conversations/${conversationId}/settlements/${settlementId}/confirm`);
  },

  // "Chưa nhận được"
  async rejectSettlement(conversationId: string, settlementId: string) {
    await api.patch(`/conversations/${conversationId}/settlements/${settlementId}/reject`);
  },

  // Tài khoản nhận tiền của người đang được mình nợ (null nếu họ chưa thêm)
  async getPaymentInfo(conversationId: string, userId: string): Promise<BankInfo | null> {
    const res = await api.get(`/conversations/${conversationId}/payment-info/${userId}`);
    return res.data.bankInfo ?? null;
  },
};