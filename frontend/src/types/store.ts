import type { Socket } from "socket.io-client";
import type { Conversation, Message, MessageReaction, ReplyPreview } from "./chat";
import type { Friend, FriendRequest, User } from "./user";
import type { UpdateProfilePayload, UpdatePrivacyPayload } from "@/services/userService";

export interface AuthState {
  accessToken: string | null;
  user: User | null;
  loading: boolean;

  setAccessToken: (accessToken: string) => void;
  setUser: (user: User) => void;
  clearState: () => void;
  signUp: (
    username: string,
    password: string,
    email: string,
    firstName: string,
    lastName: string
  ) => Promise<void>;
  signIn: (username: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  fetchMe: () => Promise<void>;
  refresh: () => Promise<void>;
}

export interface ThemeState {
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (dark: boolean) => void;
}

// 👇 MỚI THÊM: 1 người đang gõ trong 1 conversation. displayName optional vì
// khi server báo "typing:stop" chỉ gửi kèm userId, không có displayName.
export interface TypingUser {
  userId: string;
  displayName?: string;
}

export interface ChatState {
  conversations: Conversation[];
  messages: Record<string, { items: Message[]; hasMore: boolean; nextCursor?: string | null }>;
  activeConversationId: string | null;
  convoLoading: boolean;
  messageLoading: boolean;
  loading: boolean;
  // tin nhắn đang được chọn để trả lời (hiện preview phía trên ô nhập)
  replyingTo: ReplyPreview | null;
  // 👇 MỚI THÊM: danh sách người đang gõ theo từng conversationId
  typingUsers: Record<string, TypingUser[]>;
  reset: () => void;

  setActiveConversation: (id: string | null) => void;
  setReplyingTo: (message: ReplyPreview | null) => void;
  clearReplyingTo: () => void;
  fetchConversations: () => Promise<void>;
  fetchMessages: (conversationId?: string) => Promise<void>;
  sendDirectMessage: (
    recipientId: string,
    content: string,
    imgUrl?: string,
    replyTo?: string
  ) => Promise<void>;
  sendGroupMessage: (
    conversationId: string,
    content: string,
    imgUrl?: string,
    replyTo?: string
  ) => Promise<void>;
  // add message
  addMessage: (message: Message) => Promise<void>;
  // update convo
  updateConversation: (
    conversation: Partial<Conversation> & { _id: string }
  ) => void;
  markAsSeen: () => Promise<void>;
  addConvo: (convo: Conversation) => void;
  createConversation: (
    type: "group" | "direct",
    name: string,
    memberIds: string[]
  ) => Promise<void>;
  // 👇 MỚI THÊM: cập nhật reactions của 1 message trong state (dùng cho cả
  // optimistic update lúc bấm và khi nhận socket "reaction-updated")
  updateMessageReaction: (
    conversationId: string,
    messageId: string,
    reactions: MessageReaction[]
  ) => void;
  // 👇 MỚI THÊM: gọi API thả/đổi/gỡ reaction cho 1 tin nhắn
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  // 👇 MỚI THÊM: cập nhật trạng thái đang gõ của 1 user trong 1 conversation
  // (gọi khi nhận socket "typing:start"/"typing:stop")
  setUserTyping: (
    conversationId: string,
    typingUser: TypingUser,
    isTyping: boolean
  ) => void;
}

export interface SocketState {
  socket: Socket | null;
  onlineUsers: string[];
  connectSocket: () => void;
  disconnectSocket: () => void;
  // 👇 MỚI THÊM: emit báo cho những người khác trong conversation biết
  // mình đang gõ / vừa ngừng gõ
  startTyping: (conversationId: string) => void;
  stopTyping: (conversationId: string) => void;
}

export interface FriendState {
  friends: Friend[];
  loading: boolean;
  receivedList: FriendRequest[];
  sentList: FriendRequest[];
  // số lời mời kết bạn MỚI chưa được xem (dùng để hiện chấm đỏ trên icon chuông)
  unreadRequestCount: number;
  searchByUsername: (username: string) => Promise<User | null>;
  addFriend: (to: string, message?: string) => Promise<string>;
  getAllFriendRequests: () => Promise<void>;
  acceptRequest: (requestId: string) => Promise<void>;
  declineRequest: (requestId: string) => Promise<void>;
  getFriends: () => Promise<void>;
  // gọi khi socket báo rằng lời mời MÌNH GỬI đã được người kia chấp nhận
  friendRequestAccepted: (requestId: string, friend: Friend) => void;
  // gọi khi socket báo có lời mời kết bạn MỚI gửi đến mình
  friendRequestReceived: (request: FriendRequest) => void;
  // gọi khi chính mình vừa chấp nhận 1 lời mời (đồng bộ realtime đa tab/thiết bị)
  friendRequestAcceptedSelf: (requestId: string, friend: Friend) => void;
  // gọi khi user mở dropdown/dialog thông báo -> xoá chấm đỏ
  markRequestsSeen: () => void;
}

export interface UserState {
  updateAvatarUrl: (formData: FormData) => Promise<void>;
  updateProfile: (payload: UpdateProfilePayload) => Promise<boolean>;
  updatePrivacy: (payload: UpdatePrivacyPayload) => Promise<boolean>;
}