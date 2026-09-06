import { chatService } from "@/services/chatService";
import type { ChatState } from "@/types/store";
import type { Conversation, Message, ReplyPreview } from "@/types/chat";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAuthStore } from "./useAuthStore";
import { useSocketStore } from "./useSocketStore";

// 🆕 MỚI THÊM: sinh ID tạm cho tin nhắn optimistic, đủ để không trùng
// với ID thật của MongoDB (không bắt đầu bằng "temp-")
const genTempId = () => `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      messages: {},
      activeConversationId: null,
      convoLoading: false, // convo loading
      messageLoading: false,
      loading: false,
      replyingTo: null,
      typingUsers: {}, // { [conversationId]: { userId, displayName }[] }

      setActiveConversation: (id) => set({ activeConversationId: id }),
      setReplyingTo: (message: ReplyPreview | null) => set({ replyingTo: message }),
      clearReplyingTo: () => set({ replyingTo: null }),
      reset: () => {
        set({
          conversations: [],
          messages: {},
          activeConversationId: null,
          convoLoading: false,
          messageLoading: false,
          replyingTo: null,
          typingUsers: {},
        });
      },
      fetchConversations: async () => {
        try {
          set({ convoLoading: true });
          const { conversations } = await chatService.fetchConversations();

          set({ conversations, convoLoading: false });
        } catch (error) {
          console.error("Lỗi xảy ra khi fetchConversations:", error);
          set({ convoLoading: false });
        }
      },
      fetchMessages: async (conversationId) => {
        const { activeConversationId, messages } = get();
        const { user } = useAuthStore.getState();

        const convoId = conversationId ?? activeConversationId;

        if (!convoId) return;

        const current = messages?.[convoId];
        const nextCursor =
          current?.nextCursor === undefined ? "" : current?.nextCursor;

        if (nextCursor === null) return;

        set({ messageLoading: true });

        try {
          const { messages: fetched, cursor } = await chatService.fetchMessages(
            convoId,
            nextCursor
          );

          const processed = fetched.map((m) => ({
            ...m,
            isOwn: m.senderId === user?._id,
          }));

          set((state) => {
            const prev = state.messages[convoId]?.items ?? [];
            const merged = prev.length > 0 ? [...processed, ...prev] : processed;

            return {
              messages: {
                ...state.messages,
                [convoId]: {
                  items: merged,
                  hasMore: !!cursor,
                  nextCursor: cursor ?? null,
                },
              },
            };
          });
        } catch (error) {
          console.error("Lỗi xảy ra khi fetchMessages:", error);
        } finally {
          set({ messageLoading: false });
        }
      },
      // 🔧 FIX: trước đây gửi tin nhắn phải chờ trọn vẹn round-trip (HTTP
      // response -> rồi chờ socket "new-message" echo về -> mới add vào
      // UI) nên luôn có độ trễ dù mạng tốt. Giờ thêm optimistic update:
      // hiện tin nhắn ngay lập tức với _id tạm ("temp-..."), rồi thay bằng
      // tin nhắn thật khi server xác nhận. Có xử lý race-condition: nếu
      // socket "new-message" (addMessage) đến TRƯỚC khi HTTP response về
      // (tin thật đã có sẵn trong state) thì chỉ xoá tin tạm, không tạo
      // trùng; nếu gửi thất bại thì xoá tin tạm để MessageInput khôi phục
      // lại nội dung cho người dùng gõ lại.
      sendDirectMessage: async (recipientId, content, imgUrl, replyTo) => {
        const { activeConversationId, replyingTo } = get();
        const { user } = useAuthStore.getState();
        const convoId = activeConversationId;
        const tempId = genTempId();

        if (convoId && user) {
          const optimisticMessage: Message = {
            _id: tempId,
            conversationId: convoId,
            senderId: user._id,
            content: content || null,
            imgUrl,
            createdAt: new Date().toISOString(),
            isOwn: true,
            status: "sending",
            replyTo: replyingTo ?? undefined,
          };

          set((state) => {
            const current = state.messages[convoId] ?? {
              items: [],
              hasMore: false,
              nextCursor: null,
            };

            return {
              messages: {
                ...state.messages,
                [convoId]: {
                  ...current,
                  items: [...current.items, optimisticMessage],
                },
              },
            };
          });
        }

        try {
          const message = await chatService.sendDirectMessage(
            recipientId,
            content,
            imgUrl,
            convoId || undefined,
            replyTo
          );

          if (convoId) {
            set((state) => {
              const current = state.messages[convoId];
              if (!current) return state;

              // nếu socket đã echo tin thật về trước rồi -> chỉ cần bỏ tin
              // tạm, tránh hiện trùng 2 bong bóng cho cùng 1 tin nhắn
              const alreadyHasReal = current.items.some(
                (m) => m._id === message._id
              );

              const items = alreadyHasReal
                ? current.items.filter((m) => m._id !== tempId)
                : current.items.map((m) =>
                    m._id === tempId
                      ? { ...message, isOwn: true, status: "sent" as const }
                      : m
                  );

              return {
                messages: {
                  ...state.messages,
                  [convoId]: { ...current, items },
                },
              };
            });

            set((state) => ({
              conversations: state.conversations.map((c) =>
                c._id === convoId ? { ...c, seenBy: [] } : c
              ),
            }));
          }

          return message;
        } catch (error) {
          // gửi thất bại -> xoá tin nhắn tạm, để MessageInput khôi phục lại
          // nội dung cho người dùng gõ lại (logic có sẵn trong catch của nó)
          if (convoId) {
            set((state) => {
              const current = state.messages[convoId];
              if (!current) return state;

              return {
                messages: {
                  ...state.messages,
                  [convoId]: {
                    ...current,
                    items: current.items.filter((m) => m._id !== tempId),
                  },
                },
              };
            });
          }
          throw error;
        }
      },
      sendGroupMessage: async (conversationId, content, imgUrl, replyTo) => {
        const { replyingTo } = get();
        const { user } = useAuthStore.getState();
        const tempId = genTempId();

        if (user) {
          const optimisticMessage: Message = {
            _id: tempId,
            conversationId,
            senderId: user._id,
            content: content || null,
            imgUrl,
            createdAt: new Date().toISOString(),
            isOwn: true,
            status: "sending",
            replyTo: replyingTo ?? undefined,
          };

          set((state) => {
            const current = state.messages[conversationId] ?? {
              items: [],
              hasMore: false,
              nextCursor: null,
            };

            return {
              messages: {
                ...state.messages,
                [conversationId]: {
                  ...current,
                  items: [...current.items, optimisticMessage],
                },
              },
            };
          });
        }

        try {
          const message = await chatService.sendGroupMessage(
            conversationId,
            content,
            imgUrl,
            replyTo
          );

          set((state) => {
            const current = state.messages[conversationId];
            if (!current) return state;

            const alreadyHasReal = current.items.some(
              (m) => m._id === message._id
            );

            const items = alreadyHasReal
              ? current.items.filter((m) => m._id !== tempId)
              : current.items.map((m) =>
                  m._id === tempId
                    ? { ...message, isOwn: true, status: "sent" as const }
                    : m
                );

            return {
              messages: {
                ...state.messages,
                [conversationId]: { ...current, items },
              },
            };
          });

          set((state) => ({
            conversations: state.conversations.map((c) =>
              c._id === get().activeConversationId ? { ...c, seenBy: [] } : c
            ),
          }));
        } catch (error) {
          set((state) => {
            const current = state.messages[conversationId];
            if (!current) return state;

            return {
              messages: {
                ...state.messages,
                [conversationId]: {
                  ...current,
                  items: current.items.filter((m) => m._id !== tempId),
                },
              },
            };
          });
          throw error;
        }
      },
      addMessage: async (message) => {
        try {
          const { user } = useAuthStore.getState();
          const { fetchMessages } = get();

          message.isOwn = message.senderId === user?._id;

          const convoId = message.conversationId;

          let prevItems = get().messages[convoId]?.items ?? [];

          if (prevItems.length === 0) {
            await fetchMessages(message.conversationId);
            prevItems = get().messages[convoId]?.items ?? [];
          }

          set((state) => {
            if (prevItems.some((m) => m._id === message._id)) {
              return state;
            }

            return {
              messages: {
                ...state.messages,
                [convoId]: {
                  items: [...prevItems, message],
                  hasMore: state.messages[convoId].hasMore,
                  nextCursor: state.messages[convoId].nextCursor ?? undefined,
                },
              },
            };
          });
        } catch (error) {
          console.error("Lỗi xảy khi ra add message:", error);
        }
      },
      updateConversation: (conversation: Partial<Conversation> & { _id: string }) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c._id === conversation._id ? { ...c, ...conversation } : c
          ),
        }));
      },
      markAsSeen: async () => {
        try {
          const { user } = useAuthStore.getState();
          const { activeConversationId, conversations } = get();

          if (!activeConversationId || !user) {
            return;
          }

          const convo = conversations.find((c) => c._id === activeConversationId);

          if (!convo) {
            return;
          }

          if ((convo.unreadCounts?.[user._id] ?? 0) === 0) {
            return;
          }

          await chatService.markAsSeen(activeConversationId);

          set((state) => ({
            conversations: state.conversations.map((c) =>
              c._id === activeConversationId && c.lastMessage
                ? {
                    ...c,
                    unreadCounts: {
                      ...c.unreadCounts,
                      [user._id]: 0,
                    },
                  }
                : c
            ),
          }));
        } catch (error) {
          console.error("Lỗi xảy ra khi gọi markAsSeen trong store", error);
        }
      },
      addConvo: (convo) => {
        set((state) => {
          const exists = state.conversations.some(
            (c) => c._id.toString() === convo._id.toString()
          );

          return {
            conversations: exists
              ? state.conversations
              : [convo, ...state.conversations],
            activeConversationId: convo._id,
          };
        });
      },
      createConversation: async (type, name, memberIds) => {
        try {
          set({ loading: true });
          const conversation = await chatService.createConversation(
            type,
            name,
            memberIds
          );

          get().addConvo(conversation);

          useSocketStore
            .getState()
            .socket?.emit("join-conversation", conversation._id);
        } catch (error) {
          console.error("Lỗi xảy ra khi gọi createConversation trong store", error);
        } finally {
          set({ loading: false });
        }
      },

      // cập nhật reactions của 1 message trong state
      // (dùng chung cho cả optimistic update lúc bấm và khi nhận socket từ người khác)
      updateMessageReaction: (conversationId, messageId, reactions) => {
        set((state) => {
          const convoMessages = state.messages[conversationId];

          if (!convoMessages) return state;

          return {
            messages: {
              ...state.messages,
              [conversationId]: {
                ...convoMessages,
                items: convoMessages.items.map((m) =>
                  m._id === messageId ? { ...m, reactions } : m
                ),
              },
            },
          };
        });
      },

      // gọi API thả/đổi/gỡ reaction rồi cập nhật state cho tin nhắn
      // đang thuộc conversation đang mở
      toggleReaction: async (messageId, emoji) => {
        try {
          const reactions = await chatService.toggleReaction(messageId, emoji);
          const { activeConversationId } = get();

          if (activeConversationId) {
            get().updateMessageReaction(activeConversationId, messageId, reactions);
          }
        } catch (error) {
          console.error("Lỗi xảy ra khi thả reaction", error);
        }
      },

      // xóa (ẩn) đoạn chat phía mình khỏi sidebar.
      // Gọi API trước, chỉ xóa khỏi state khi API thành công. Nếu đoạn chat
      // đang được mở, bỏ chọn nó luôn để ChatWindow quay về màn hình chào.
      hideConversation: async (conversationId) => {
        try {
          await chatService.hideConversation(conversationId);

          set((state) => ({
            conversations: state.conversations.filter(
              (c) => c._id !== conversationId
            ),
            activeConversationId:
              state.activeConversationId === conversationId
                ? null
                : state.activeConversationId,
          }));
        } catch (error) {
          console.error("Lỗi xảy ra khi xóa đoạn chat", error);
          throw error;
        }
      },

      // ==================== TYPING INDICATOR ====================
      // typingUser chỉ cần userId là bắt buộc, displayName optional (khi ngừng
      // gõ, server không gửi kèm displayName nên không cần).
      setUserTyping: (conversationId, typingUser, isTyping) => {
        set((state) => {
          const current = state.typingUsers[conversationId] ?? [];
          let updated;

          if (isTyping) {
            const alreadyIn = current.some((u) => u.userId === typingUser.userId);
            updated = alreadyIn
              ? current.map((u) =>
                  u.userId === typingUser.userId ? { ...u, ...typingUser } : u
                )
              : [...current, typingUser];
          } else {
            updated = current.filter((u) => u.userId !== typingUser.userId);
          }

          return {
            typingUsers: {
              ...state.typingUsers,
              [conversationId]: updated,
            },
          };
        });
      },
      // ==================== HẾT PHẦN TYPING INDICATOR ====================
    }),
    {
      name: "chat-storage",
      partialize: (state) => ({ conversations: state.conversations }),
    }
  )
);