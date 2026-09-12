import mongoose from "mongoose";

const participantSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  }
);

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    _id: false,
  }
);

const lastMessageSchema = new mongoose.Schema(
  {
    _id: { type: String },
    content: {
      type: String,
      default: null,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
  }
);

const conversationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["direct", "group"],
      required: true,
    },
    participants: {
      type: [participantSchema],
      required: true,
    },
    group: {
      type: groupSchema,
    },
    lastMessageAt: {
      type: Date,
    },
    seenBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    lastMessage: {
      type: lastMessageSchema,
      default: null,
    },
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },
    // 🆕 MỚI THÊM: danh sách user đã "xóa" (ẩn) đoạn chat này phía họ.
    // Không xóa conversation/message thật — chỉ ẩn khỏi sidebar của user đó.
    // Chỉ tự hiện lại khi CHÍNH người đã xóa chủ động gửi tin nhắn lại
    // (qua tìm kiếm) — xem sendDirectMessage/createConversation. Nếu người
    // còn lại nhắn tới trước, đoạn chat KHÔNG tự hiện lại phía người đã xóa.
    hiddenFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // 🆕 MỚI THÊM: mốc thời gian mỗi user bấm "Xóa đoạn chat" lần gần nhất.
    // Dùng để lọc tin nhắn cũ ra khỏi lịch sử của RIÊNG người đó (getMessages
    // chỉ trả tin nhắn tạo SAU mốc này) — tạo cảm giác "mất hết lịch sử cũ"
    // dù dữ liệu thật vẫn còn nguyên cho người kia. Key là userId dạng string.
    clearedFor: {
      type: Map,
      of: Date,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

conversationSchema.index({
  "participant.userId": 1,
  lastMessageAt: -1,
});

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;