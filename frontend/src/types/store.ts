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
  // 👇 SỬA: giờ trả về message vừa gửi (backend không còn "giả vờ thành công"
  // khi bị chặn - lỗi 403 blocked sẽ ném ra ngoài để nơi gọi tự bắt)
  sendDirectMessage: (
    recipientId: string,
    content: string,
    imgUrl?: string,
    replyTo?: string
  ) => Promise<Message>;
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
  // 👇 MỚI THÊM: xóa (ẩn) đoạn chat phía user hiện tại — không xóa dữ liệu
  // thật, chỉ ẩn khỏi sidebar của họ
  hideConversation: (conversationId: string) => Promise<void>;
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

// 👇 MỚI THÊM: 1 người đang nằm trong danh sách bị mình chặn
export interface BlockedUser {
  _id: string;
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  blockedAt: string;
}

export interface FriendState {
  friends: Friend[];
  loading: boolean;
  receivedList: FriendRequest[];
  sentList: FriendRequest[];
  // số lời mời kết bạn MỚI chưa được xem (dùng để hiện chấm đỏ trên icon chuông)
  unreadRequestCount: number;
  // 👇 MỚI THÊM: danh sách những người mình đã chặn (cho màn "Người dùng đã chặn")
  blockedUsers: BlockedUser[];
  // 👇 MỚI THÊM: danh sách id bạn bè mà MÌNH đã chặn (dùng để disable chat realtime)
  blockedFriendIds: string[];
  // 👇 MỚI THÊM: danh sách id người ĐANG chặn mình (để hiện banner "bạn đã bị chặn")
  blockedMeIds: string[];
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
  // gọi API chặn 1 người bạn (chặn tin nhắn + cuộc gọi, tự động hủy kết bạn)
  blockFriend: (friendId: string) => Promise<boolean>;
  // gọi API xóa 1 người khỏi danh sách bạn bè
  unfriend: (friendId: string) => Promise<boolean>;
  // gọi khi socket báo bên kia vừa block/unfriend mình -> xóa khỏi danh sách friends
  friendRemoved: (friendId: string) => void;
  // 👇 MỚI THÊM: lấy danh sách người mình đã chặn
  getBlockedUsers: () => Promise<void>;
  // 👇 MỚI THÊM: bỏ chặn 1 người
  unblockUser: (userId: string) => Promise<boolean>;
  // 👇 MỚI THÊM: kiểm tra + đồng bộ trạng thái chặn của 1 friendId (cả 2 chiều)
  // vào blockedFriendIds / blockedMeIds
  checkBlockStatus: (friendId: string) => Promise<boolean>;
  // 👇 MỚI THÊM: gọi khi socket báo "user-blocked" / "user-unblocked" - cập
  // nhật chiều "người khác chặn/bỏ chặn mình"
  setBlockedByOther: (userId: string, blocked: boolean) => void;
}

export interface UserState {
  updateAvatarUrl: (formData: FormData) => Promise<void>;
  updateProfile: (payload: UpdateProfilePayload) => Promise<boolean>;
  updatePrivacy: (payload: UpdatePrivacyPayload) => Promise<boolean>;
}