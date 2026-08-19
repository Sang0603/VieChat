import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "./useAuthStore";
import type { SocketState } from "@/types/store";
import { useChatStore } from "./useChatStore";
import { useFriendStore } from "./useFriendStore";

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
  },
  disconnectSocket: () => {
    const socket = get().socket;
    if (socket) {
      socket.disconnect();
      set({ socket: null });
    }
  },
}));