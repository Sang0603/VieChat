import { friendService } from "@/services/friendService";
import type { FriendState } from "@/types/store";
import { create } from "zustand";

export const useFriendStore = create<FriendState>((set, _get) => ({
  friends: [],
  loading: false,
  receivedList: [],
  sentList: [],
  unreadRequestCount: 0,
  blockedUsers: [],
  blockedFriendIds: [],
  searchByUsername: async (username) => {
    try {
      set({ loading: true });

      const user = await friendService.searchByUsername(username);

      return user;
    } catch (error) {
      console.error("Lỗi xảy ra khi tìm user bằng username", error);
      return null;
    } finally {
      set({ loading: false });
    }
  },
  addFriend: async (to, message) => {
    try {
      set({ loading: true });
      const resultMessage = await friendService.sendFriendRequest(to, message);
      return resultMessage;
    } catch (error) {
      console.error("Lỗi xảy ra khi addFriend", error);
      return "Lỗi xảy ra khi gửi kết bạn. Hãy thử lại";
    } finally {
      set({ loading: false });
    }
  },
  getAllFriendRequests: async () => {
    try {
      set({ loading: true });

      const result = await friendService.getAllFriendRequest();

      if (!result) return;

      const { received, sent } = result;

      set({ receivedList: received, sentList: sent });
    } catch (error) {
      console.error("Lỗi xảy ra khi getAllFriendRequests", error);
    } finally {
      set({ loading: false });
    }
  },
  acceptRequest: async (requestId) => {
    try {
      set({ loading: true });
      const newFriend = await friendService.acceptRequest(requestId);

      set((state) => ({
        receivedList: state.receivedList.filter((r) => r._id !== requestId),
        friends: newFriend
          ? [newFriend, ...state.friends.filter((f) => f._id !== newFriend._id)]
          : state.friends,
      }));
    } catch (error) {
      console.error("Lỗi xảy ra khi acceptRequest", error);
    } finally {
      set({ loading: false });
    }
  },
  declineRequest: async (requestId) => {
    try {
      set({ loading: true });
      await friendService.declineRequest(requestId);

      set((state) => ({
        receivedList: state.receivedList.filter((r) => r._id !== requestId),
      }));
    } catch (error) {
      console.error("Lỗi xảy ra khi declineRequest", error);
    } finally {
      set({ loading: false });
    }
  },
  getFriends: async () => {
    try {
      set({ loading: true });
      const friends = await friendService.getFriendList();
      set({ friends: friends });
    } catch (error) {
      console.error("Lỗi xảy ra khi load friends", error);
      set({ friends: [] });
    } finally {
      set({ loading: false });
    }
  },
  // gọi khi socket báo rằng lời mời MÌNH GỬI đã được người kia chấp nhận
  friendRequestAccepted: (requestId, friend) => {
    set((state) => ({
      sentList: state.sentList.filter((r) => r._id !== requestId),
      friends: [friend, ...state.friends.filter((f) => f._id !== friend._id)],
    }));
  },
  // gọi khi socket báo có lời mời kết bạn MỚI gửi đến mình
  friendRequestReceived: (request) => {
    set((state) => {
      // tránh thêm trùng nếu vì lý do gì đó nhận event 2 lần
      if (state.receivedList.some((r) => r._id === request._id)) {
        return state;
      }

      return {
        receivedList: [request, ...state.receivedList],
        unreadRequestCount: state.unreadRequestCount + 1,
      };
    });
  },
  // gọi khi chính mình vừa chấp nhận 1 lời mời (đồng bộ realtime đa tab/thiết bị)
  friendRequestAcceptedSelf: (requestId, friend) => {
    set((state) => ({
      receivedList: state.receivedList.filter((r) => r._id !== requestId),
      friends: [friend, ...state.friends.filter((f) => f._id !== friend._id)],
    }));
  },
  // gọi khi user mở dropdown/dialog thông báo -> xoá chấm đỏ
  markRequestsSeen: () => {
    set({ unreadRequestCount: 0 });
  },
  blockFriend: async (friendId) => {
    try {
      set({ loading: true });
      await friendService.blockFriend(friendId);
      set((state) => ({
        friends: state.friends.filter((f) => f._id !== friendId),
        blockedFriendIds: state.blockedFriendIds.includes(friendId)
          ? state.blockedFriendIds
          : [...state.blockedFriendIds, friendId],
      }));
      return true;
    } catch (error) {
      console.error("Lỗi xảy ra khi blockFriend", error);
      return false;
    } finally {
      set({ loading: false });
    }
  },
  unfriend: async (friendId) => {
    try {
      set({ loading: true });
      await friendService.unfriend(friendId);
      set((state) => ({
        friends: state.friends.filter((f) => f._id !== friendId),
      }));
      return true;
    } catch (error) {
      console.error("Lỗi xảy ra khi unfriend", error);
      return false;
    } finally {
      set({ loading: false });
    }
  },
  // gọi khi socket báo bên kia block/unfriend mình
  friendRemoved: (friendId) => {
    set((state) => ({
      friends: state.friends.filter((f) => f._id !== friendId),
    }));
  },
  getBlockedUsers: async () => {
    try {
      set({ loading: true });
      const blockedUsers = await friendService.getBlockedUsers();
      set({ blockedUsers });
    } catch (error) {
      console.error("Lỗi xảy ra khi load blockedUsers", error);
      set({ blockedUsers: [] });
    } finally {
      set({ loading: false });
    }
  },
  unblockUser: async (userId) => {
    try {
      set({ loading: true });
      await friendService.unblockUser(userId);
      set((state) => ({
        blockedUsers: state.blockedUsers.filter((u) => u._id !== userId),
        blockedFriendIds: state.blockedFriendIds.filter((id) => id !== userId),
      }));
      return true;
    } catch (error) {
      console.error("Lỗi xảy ra khi unblockUser", error);
      return false;
    } finally {
      set({ loading: false });
    }
  },
  checkBlockStatus: async (friendId) => {
    try {
      const { blockedByMe } = await friendService.getBlockStatus(friendId);
      set((state) => ({
        blockedFriendIds: blockedByMe
          ? state.blockedFriendIds.includes(friendId)
            ? state.blockedFriendIds
            : [...state.blockedFriendIds, friendId]
          : state.blockedFriendIds.filter((id) => id !== friendId),
      }));
      return blockedByMe;
    } catch (error) {
      console.error("Lỗi xảy ra khi checkBlockStatus", error);
      return false;
    }
  },
}));