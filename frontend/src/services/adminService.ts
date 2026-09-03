import api from "@/lib/axios";

export interface AdminOverviewStats {
  totalUsers: number;
  onlineUsers: number;
  totalMessages: number;
  todayMessages: number;
  // 👇 MỚI THÊM — khớp với adminController.getOverviewStats() đã cập nhật
  totalRooms: number;
  sharedFiles: number;
  totalCalls: number;
  completedCalls: number;
  avgCallDurationSec: number;
  totalUsersTrendPct: number;
  totalMessagesTrendPct: number;
  todayMessagesTrendPct: number;
}

export interface AdminDailyPoint {
  date: string; // "dd/MM"
  value: number;
}

export interface AdminActivityPoint {
  date: string;
  messages: number;
  newUsers: number;
  activeUsers: number;
}

export const adminService = {
  async getOverviewStats(): Promise<AdminOverviewStats> {
    const res = await api.get("/admin/stats");
    return res.data;
  },

  async getRegistrationsByDay(days = 14): Promise<AdminDailyPoint[]> {
    const res = await api.get(`/admin/stats/registrations?days=${days}`);
    return res.data;
  },

  async getMessagesByDay(days = 14): Promise<AdminDailyPoint[]> {
    const res = await api.get(`/admin/stats/messages?days=${days}`);
    return res.data;
  },

  async getOnlineSnapshot(): Promise<{ time: string; online: number }> {
    const res = await api.get("/admin/stats/online");
    return res.data;
  },

  async getActivityStats(days = 7): Promise<AdminActivityPoint[]> {
    const res = await api.get(`/admin/stats/activity?days=${days}`);
    return res.data;
  },
};