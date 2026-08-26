import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "./useAuthStore";
import type { SocketState } from "@/types/store";
import { useChatStore } from "./useChatStore";
import { useFriendStore } from "./useFriendStore";
import { useCallStore } from "./useCallStore"; // 👈 mới thêm

const baseURL = import.meta.env.VITE_SOCKET_URL;

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  onlineUsers: [],
  connectSocket: () => {
    const accessToken = useAuthStore.getState().accessToken;
    const existingSocket = get().socket;

    if (existingSocket) return; // tránh tạo nhiều socket

    const socket: Socket = io(baseURL, {
      auth: { token: accessToken },
      transports: ["websocket"],
    });

    set({ socket });

    socket.on("connect", () => {
      console.log("Đã kết nối với socket");
    });

    // online users
    socket.on("online-users", (userIds) => {
      set({ onlineUsers: userIds });
    });

    // new message
    socket.on("new-message", ({ message, conversation, unreadCounts }) => {
      useChatStore.getState().addMessage(message);

      const lastMessage = {
        _id: conversation.lastMessage._id,
        content: conversation.lastMessage.content,
        createdAt: conversation.lastMessage.createdAt,
        sender: {
          _id: conversation.lastMessage.senderId,
          displayName: "",
          avatarUrl: null,
        },
      };

      const updatedConversation = {
        ...conversation,
        lastMessage,
        unreadCounts,
      };

      if (useChatStore.getState().activeConversationId === message.conversationId) {
        useChatStore.getState().markAsSeen();
      }

      useChatStore.getState().updateConversation(updatedConversation);

      // 👇 MỚI THÊM: có tin nhắn mới nghĩa là người gửi đã ngừng gõ rồi ->
      // dọn luôn trạng thái "đang nhập..." của họ để tránh bị kẹt hiển thị
      // (phòng trường hợp client kia gửi tin quá nhanh, chưa kịp emit typing:stop)
      useChatStore
        .getState()
        .setUserTyping(message.conversationId, { userId: message.senderId }, false);
    });

    // read message
    socket.on("read-message", ({ conversation, lastMessage }) => {
      const updated = {
        _id: conversation._id,
        lastMessage,
        lastMessageAt: conversation.lastMessageAt,
        unreadCounts: conversation.unreadCounts,
        seenBy: conversation.seenBy,
      };

      useChatStore.getState().updateConversation(updated);
    });

    // new group chat
    socket.on("new-group", (conversation) => {
      useChatStore.getState().addConvo(conversation);
      socket.emit("join-conversation", conversation._id);
    });

    // lời mời kết bạn mình đã gửi được người kia chấp nhận
    socket.on("friend-request-accepted", ({ requestId, friend }) => {
      useFriendStore.getState().friendRequestAccepted(requestId, friend);
    });

    // có người vừa gửi lời mời kết bạn đến mình -> hiện chấm đỏ ngay
    socket.on("friend-request-received", ({ request }) => {
      useFriendStore.getState().friendRequestReceived(request);
    });

    // chính mình vừa chấp nhận 1 lời mời (đồng bộ nếu đang mở nhiều tab/thiết bị)
    socket.on("friend-request-accepted-self", ({ requestId, friend }) => {
      useFriendStore.getState().friendRequestAcceptedSelf(requestId, friend);
    });

    // conversation direct mới được tạo (khi 2 người vừa trở thành bạn bè)
    // -> đẩy thẳng vào useChatStore().conversations để sidebar "BẠN BÈ" hiện ra
    // ngay lập tức, không cần F5. Đồng thời join luôn room của conversation đó
    // để các sự kiện new-message/read-message sau này tới được client ngay,
    // không cần reload trang hay kết nối lại socket.
    socket.on("conversation-created", ({ conversation }) => {
      useChatStore.getState().addConvo(conversation);
      socket.emit("join-conversation", conversation._id);
    });

    // 👇 MỚI THÊM: có người gọi thoại đến -> đẩy vào useCallStore để
    // IncomingCallModal tự hiện popup (xem components/call/IncomingCallModal.tsx)
    socket.on("call:incoming", ({ callId, fromUser, callType, conversationId }) => {
      useCallStore.getState().receiveIncomingCall({
        callId,
        conversationId,
        peer: fromUser,
        callType,
      });
    });

    // 👇 MỚI THÊM: có người (bao gồm cả chính mình ở tab/thiết bị khác) vừa
    // thả/đổi/gỡ reaction trên 1 tin nhắn -> cập nhật ngay trong khung chat
    socket.on("reaction-updated", ({ conversationId, messageId, reactions }) => {
      useChatStore.getState().updateMessageReaction(conversationId, messageId, reactions);
    });

    // ==================== 👇 MỚI THÊM: TYPING INDICATOR ====================
    socket.on("typing:start", ({ conversationId, userId, displayName }) => {
      useChatStore.getState().setUserTyping(conversationId, { userId, displayName }, true);
    });

    socket.on("typing:stop", ({ conversationId, userId }) => {
      useChatStore.getState().setUserTyping(conversationId, { userId }, false);
    });
    // ==================== HẾT PHẦN TYPING INDICATOR ====================
  },
  disconnectSocket: () => {
    const socket = get().socket;
    if (socket) {
      socket.disconnect();
      set({ socket: null });
    }
  },

  // 👇 MỚI THÊM: 2 hàm để component gọi khi user bắt đầu/ngừng gõ.
  // Không tự debounce ở đây — phần debounce (đợi ngừng gõ ~2s rồi mới
  // gọi stopTyping) nằm ở MessageInput.tsx, vì đó là nơi biết chính xác
  // khi nào user gõ tiếp/dừng.
  startTyping: (conversationId) => {
    const socket = get().socket;
    if (!socket || !conversationId) return;
    socket.emit("typing:start", { conversationId });
  },
  stopTyping: (conversationId) => {
    const socket = get().socket;
    if (!socket || !conversationId) return;
    socket.emit("typing:stop", { conversationId });
  },
}));