import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner"; // 🆕 MỚI THÊM
import { useAuthStore } from "./useAuthStore";
import type { SocketState } from "@/types/store";
import { useChatStore, dropConversationLocally } from "./useChatStore"; // 🆕 thêm dropConversationLocally
import { useFriendStore } from "./useFriendStore";
import { useCallStore } from "./useCallStore";
import { useExpenseStore } from "./useExpenseStore"; // 👈 MỚI THÊM

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

    // 🆕 MỚI THÊM: có người được thêm vào nhóm -> cập nhật danh sách thành viên
    // realtime cho các thành viên cũ (không cần reload trang)
    socket.on("group-members-added", ({ conversationId, participants }) => {
      useChatStore.getState().updateConversation({
        _id: conversationId,
        participants,
      });
    });

    // 🆕 MỚI THÊM: chủ nhóm kick thành viên.
    // - Chính người bị kick: gỡ nhóm khỏi sidebar
    // - Thành viên còn lại: cập nhật lại danh sách thành viên
    socket.on("group-member-removed", ({ conversationId, removedId, participants }) => {
      const me = useAuthStore.getState().user?._id;

      if (removedId === me) {
        dropConversationLocally(conversationId);
        toast.info("Bạn đã bị xóa khỏi nhóm");
        return;
      }

      useChatStore.getState().updateConversation({
        _id: conversationId,
        participants,
      });
    });

    // 🆕 MỚI THÊM: chủ nhóm xóa nhóm -> gỡ nhóm khỏi sidebar của mọi thành viên
    socket.on("group-deleted", ({ conversationId }) => {
      dropConversationLocally(conversationId);
      toast.info("Nhóm đã bị chủ nhóm xóa");
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

    // ==================== 👇 MỚI THÊM: BLOCK STATUS REALTIME ====================
    // báo real-time cho phía BỊ chặn / vừa được bỏ chặn, không cần load lại trang
    socket.on("user-blocked", ({ by }) => {
      useFriendStore.getState().setBlockedByOther(by, true);
    });

    socket.on("user-unblocked", ({ by }) => {
      useFriendStore.getState().setBlockedByOther(by, false);
    });
    // ==================== HẾT PHẦN BLOCK STATUS REALTIME ====================

    // ==================== TYPING INDICATOR ====================
    socket.on("typing:start", ({ conversationId, userId, displayName }) => {
      useChatStore.getState().setUserTyping(conversationId, { userId, displayName }, true);
    });

    socket.on("typing:stop", ({ conversationId, userId }) => {
      useChatStore.getState().setUserTyping(conversationId, { userId }, false);
    });
    // ==================== HẾT PHẦN TYPING INDICATOR ====================

    // ==================== 👇 MỚI THÊM: CHI TIÊU NHÓM REALTIME ====================
    // có người thêm/xóa khoản chi hoặc báo đã chuyển tiền -> tải lại số dư.
    // Chỉ tải lại nếu máy này đã từng mở bảng Chi tiêu của nhóm đó.
    socket.on("expense-updated", ({ conversationId }) => {
      useExpenseStore.getState().refresh(conversationId);
    });

    // 🆕 MỚI THÊM: khoản chi bị xóa -> backend đã xóa thẻ thông báo của nó khỏi chat,
    // bỏ thẻ đó khỏi khung chat đang hiển thị. Nếu thẻ từng là tin cuối của nhóm thì
    // backend gửi kèm tin cuối mới để sidebar cập nhật theo.
    socket.on(
      "messages-removed",
      ({
        conversationId,
        messageIds,
        lastMessage,
        lastMessageAt,
      }: {
        conversationId: string;
        messageIds: string[];
        lastMessage?: {
          _id: string;
          content: string;
          senderId: string;
          createdAt: string;
        } | null;
        lastMessageAt?: string;
      }) => {
        const removed = new Set(messageIds);

        useChatStore.setState((state) => {
          const current = state.messages[conversationId];

          const messages = current
            ? {
                ...state.messages,
                [conversationId]: {
                  ...current,
                  items: current.items.filter((m) => !removed.has(m._id)),
                },
              }
            : state.messages;

          // lastMessage === undefined nghĩa là tin cuối không đổi
          const conversations =
            lastMessage === undefined
              ? state.conversations
              : state.conversations.map((c) =>
                  c._id === conversationId
                    ? {
                        ...c,
                        lastMessage: lastMessage
                          ? {
                              _id: lastMessage._id,
                              content: lastMessage.content,
                              createdAt: lastMessage.createdAt,
                              sender: {
                                _id: lastMessage.senderId,
                                displayName: "",
                                avatarUrl: null,
                              },
                            }
                          : null,
                        ...(lastMessageAt ? { lastMessageAt } : {}),
                      }
                    : c
                );

          return { messages, conversations };
        });
      }
    );
    // ==================== HẾT PHẦN CHI TIÊU NHÓM REALTIME ====================
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