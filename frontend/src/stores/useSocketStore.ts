import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "./useAuthStore";
import type { SocketState } from "@/types/store";
import { useChatStore } from "./useChatStore";
import { useFriendStore } from "./useFriendStore";
import { useCallStore } from "./useCallStore";

const baseURL = import.meta.env.VITE_SOCKET_URL;

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  onlineUsers: [],
  connectSocket: () => {
    const accessToken = useAuthStore.getState().accessToken;
    const existingSocket = get().socket;

    if (existingSocket) return;

    const socket: Socket = io(baseURL, {
      auth: { token: accessToken },
      transports: ["websocket"],
    });

    set({ socket });

    socket.on("connect", () => {
      console.log("Đã kết nối với socket");
    });

    socket.on("online-users", (userIds) => {
      set({ onlineUsers: userIds });
    });

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

      useChatStore
        .getState()
        .setUserTyping(message.conversationId, { userId: message.senderId }, false);
    });

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

    socket.on("new-group", (conversation) => {
      useChatStore.getState().addConvo(conversation);
      socket.emit("join-conversation", conversation._id);
    });

    socket.on("friend-request-accepted", ({ requestId, friend }) => {
      useFriendStore.getState().friendRequestAccepted(requestId, friend);
    });

    socket.on("friend-request-received", ({ request }) => {
      useFriendStore.getState().friendRequestReceived(request);
    });

    socket.on("friend-request-accepted-self", ({ requestId, friend }) => {
      useFriendStore.getState().friendRequestAcceptedSelf(requestId, friend);
    });

    socket.on("conversation-created", ({ conversation }) => {
      useChatStore.getState().addConvo(conversation);
      socket.emit("join-conversation", conversation._id);
    });

    socket.on("call:incoming", ({ callId, fromUser, callType, conversationId }) => {
      useCallStore.getState().receiveIncomingCall({
        callId,
        conversationId,
        peer: fromUser,
        callType,
      });
    });

    socket.on("reaction-updated", ({ conversationId, messageId, reactions }) => {
      useChatStore.getState().updateMessageReaction(conversationId, messageId, reactions);
    });

    // ==================== FRIEND REMOVED (block / unfriend) ====================
    socket.on("friend-removed", ({ friendId }) => {
      useFriendStore.getState().friendRemoved(friendId);
    });
    // ==================== HẾT PHẦN FRIEND REMOVED ====================

    // ==================== TYPING INDICATOR ====================
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