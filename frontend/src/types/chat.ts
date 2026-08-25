export interface Participant {
  _id: string;
  displayName: string;
  avatarUrl?: string | null;
  joinedAt: string;
}

export interface SeenUser {
  _id: string;
  displayName?: string;
  avatarUrl?: string | null;
}

export interface Group {
  name: string;
  createdBy: string;
}

export interface LastMessage {
  _id: string;
  content: string;
  createdAt: string;
  sender: {
    _id: string;
    displayName: string;
    avatarUrl?: string | null;
  };
}

export interface Conversation {
  _id: string;
  type: "direct" | "group";
  group: Group;
  participants: Participant[];
  lastMessageAt: string;
  seenBy: SeenUser[];
  lastMessage: LastMessage | null;
  unreadCounts: Record<string, number>; // key = userId, value = unread count
  createdAt: string;
  updatedAt: string;
}

export interface ConversationResponse {
  conversations: Conversation[];
}

export interface CallInfo {
  callId: string;
  callType: "audio" | "video";
  status: "completed" | "missed" | "rejected" | "cancelled";
  callerId: string;
  calleeId: string;
  durationInSeconds: number;
}

// bản rút gọn của tin nhắn gốc, dùng để hiển thị preview khi trả lời
export interface ReplyPreview {
  _id: string;
  content: string | null;
  imgUrl?: string | null;
  senderId: string;
  senderName?: string;
}

// 👇 MỚI THÊM: 1 reaction của 1 user trên 1 tin nhắn
export interface MessageReaction {
  userId: string;
  emoji: string;
}

export interface Message {
  _id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  imgUrl?: string | null;
  updatedAt?: string | null;
  createdAt: string;
  isOwn?: boolean;
  // "text" (mặc định) | "call" (log cuộc gọi, hiện dạng thẻ trong khung chat)
  type?: "text" | "call";
  callInfo?: CallInfo;
  // tin nhắn đang được trả lời (nếu có)
  replyTo?: ReplyPreview | null;
  // 👇 MỚI THÊM: danh sách reaction hiện có trên tin nhắn
  reactions?: MessageReaction[];
}