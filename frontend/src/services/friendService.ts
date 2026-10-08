import api from "@/lib/axios";
import type { Friend } from "@/types/user";

export const friendService = {
  // giữ lại cho code cũ: trả về người đầu tiên khớp tên hiển thị
  async searchByUsername(name: string) {
    const res = await api.get("/users/search", { params: { name } });
    return res.data.user;
  },

  // 👇 MỚI THÊM: tìm theo tên hiển thị, trả về DANH SÁCH (tối đa 10 người)
  async searchUsersByName(name: string) {
    const res = await api.get("/users/search", { params: { name } });
    return res.data.users ?? [];
  },

  async sendFriendRequest(to: string, message?: string) {
    const res = await api.post("/friends/requests", { to, message });
    return res.data.message;
  },

  async getAllFriendRequest() {
    try {
      const res = await api.get("/friends/requests");
      const { sent, received } = res.data;
      return { sent, received };
    } catch (error) {
      console.error("Lỗi khi gửi getAllFriendRequest", error);
    }
  },

  async acceptRequest(requestId: string) {
    try {
      const res = await api.post(`/friends/requests/${requestId}/accept`);
      return res.data.newFriend;
    } catch (error) {
      console.error("Lỗi khi gửi acceptRequest", error);
    }
  },

  async declineRequest(requestId: string) {
    try {
      await api.post(`/friends/requests/${requestId}/decline`);
    } catch (error) {
      console.error("Lỗi khi gửi declineRequest", error);
    }
  },

  async getFriendList() {
    const res = await api.get("/friends");
    return res.data.friends;
  },

  async getFriendProfile(friendId: string): Promise<Friend> {
    const res = await api.get(`/friends/${friendId}/profile`);
    return res.data.friend;
  },

  async blockFriend(friendId: string) {
    const res = await api.post(`/friends/${friendId}/block`);
    return res.data.message;
  },

  async unfriend(friendId: string) {
    const res = await api.delete(`/friends/${friendId}`);
    return res.data.message;
  },

  async getBlockedUsers() {
    const res = await api.get("/friends/blocked");
    return res.data.blockedUsers;
  },

  async unblockUser(userId: string) {
    const res = await api.delete(`/friends/blocked/${userId}`);
    return res.data.message;
  },

  async getBlockStatus(friendId: string): Promise<{ blockedByMe: boolean; blockedMe: boolean }> {
    const res = await api.get(`/friends/${friendId}/block-status`);
    return res.data;
  },
};