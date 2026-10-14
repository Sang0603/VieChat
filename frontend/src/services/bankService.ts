import api from "@/lib/axios";

export interface Bank {
  bin: string;
  shortName: string;
  name: string;
  logo?: string;
}

export interface BankInfo {
  bankId: string;
  accountNo: string;
  accountName: string;
}

export const bankService = {
  async getBanks(): Promise<Bank[]> {
    const res = await api.get("/users/banks");
    return res.data.banks ?? [];
  },

  async getBankInfo(): Promise<BankInfo | null> {
    const res = await api.get("/users/bank-info");
    return res.data.bankInfo ?? null;
  },

  async saveBankInfo(info: BankInfo): Promise<BankInfo | null> {
    const res = await api.patch("/users/bank-info", info);
    return res.data.bankInfo ?? null;
  },

  async deleteBankInfo() {
    await api.delete("/users/bank-info");
  },
};