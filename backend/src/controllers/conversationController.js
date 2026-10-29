import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Expense from "../models/Expense.js"; // 🆕 để dọn dữ liệu khi xóa nhóm
import Settlement from "../models/Settlement.js"; // 🆕
import CallLog from "../models/CallLog.js"; // 🆕
import User from "../models/User.js"; // 🆕 MỚI THÊM
import { io } from "../socket/index.js";

const MAX_MESSAGES_PER_PAGE = 100; // 🆕 giới hạn tối đa 1 lần tải tin nhắn
const DEFAULT_MESSAGES_PER_PAGE = 50;

// 🆕 Xóa toàn bộ dữ liệu gắn với 1 conversation (dùng khi xóa nhóm / người
// cuối cùng rời nhóm) để không để lại tin nhắn, khoản chi, khoản trả nợ và
// lịch sử cuộc gọi mồ côi trong database.
const deleteConversationData = async (conversationId) => {
  await Promise.all([
    Message.deleteMany({ conversationId }),
    Expense.deleteMany({ conversationId }),
    Settlement.deleteMany({ conversationId }),
    CallLog.deleteMany({ conversationId }),
  ]);
};

export const createConversation = async (req, res) => {
  try {
    const { type, name, memberIds } = req.body;
    const userId = req.user._id;

    if (
      !type ||
      (type === "group" && !name) ||
      !memberIds ||
      !Array.isArray(memberIds) ||
      memberIds.length === 0
    ) {
      return res
        .status(400)
        .json({ message: "Tên nhóm và danh sách thành viên là bắt buộc" });
    }

    // 🆕 id sai định dạng -> 400 thay vì lỗi 500 (CastError)
    if (!memberIds.every((id) => mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ message: "Danh sách thành viên không hợp lệ" });
    }

    let conversation;

    if (type === "direct") {
      const participantId = memberIds[0];

      conversation = await Conversation.findOne({
        type: "direct",
        "participants.userId": { $all: [userId, participantId] },
      });

      if (!conversation) {
        conversation = new Conversation({
          type: "direct",
          participants: [{ userId }, { userId: participantId }],
          lastMessageAt: new Date(),
        });

        await conversation.save();
      } else if (conversation.hiddenFor?.some((id) => id.toString() === userId.toString())) {
        // 🆕 MỚI THÊM: chính người ĐÃ xóa đoạn chat này giờ chủ động tạo lại
        // (qua tìm kiếm) -> gỡ họ khỏi hiddenFor để nó hiện lại trong sidebar.
        // KHÔNG đụng vào clearedFor -> lịch sử tin nhắn cũ vẫn bị ẩn vĩnh viễn
        // với riêng họ, đúng như hành vi "xóa xong mất hết, muốn thấy lại
        // phải nhắn mới".
        conversation.hiddenFor = conversation.hiddenFor.filter(
          (id) => id.toString() !== userId.toString()
        );
        await conversation.save();
      }
    }

    if (type === "group") {
      conversation = new Conversation({
        type: "group",
        participants: [{ userId }, ...memberIds.map((id) => ({ userId: id }))],
        group: {
          name,
          createdBy: userId,
        },
        lastMessageAt: new Date(),
      });

      await conversation.save();
    }

    if (!conversation) {
      return res.status(400).json({ message: "Conversation type không hợp lệ" });
    }

    await conversation.populate([
      { path: "participants.userId", select: "displayName avatarUrl" },
      {
        path: "seenBy",
        select: "displayName avatarUrl",
      },
      { path: "lastMessage.senderId", select: "displayName avatarUrl" },
    ]);

    // 🔧 FIX: lọc bỏ participant mà user đã bị xóa khỏi DB (populate trả về null),
    // tránh gửi xuống frontend participant có _id undefined gây crash MessageItem.tsx
    const participants = (conversation.participants || [])
      .filter((p) => p.userId)
      .map((p) => ({
        _id: p.userId._id,
        displayName: p.userId.displayName,
        avatarUrl: p.userId.avatarUrl ?? null,
        joinedAt: p.joinedAt,
      }));

    const formatted = { ...conversation.toObject(), participants };

    if (type === "group") {
      memberIds.forEach((userId) => {
        io.to(userId).emit("new-group", formatted);
      });
    }

    if (type === "direct") {
      io.to(userId).emit("new-group", formatted);
      io.to(memberIds[0]).emit("new-group", formatted);
    }

    return res.status(201).json({ conversation: formatted });
  } catch (error) {
    console.error("Lỗi khi tạo conversation", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getConversations = async (req, res) => {
  try {
    const userId = req.user._id;
    const conversations = await Conversation.find({
      "participants.userId": userId,
      // 🆕 MỚI THÊM: không trả về những đoạn chat mà user này đã "xóa" (ẩn)
      hiddenFor: { $ne: userId },
    })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .populate({
        path: "participants.userId",
        select: "displayName avatarUrl",
      })
      .populate({
        path: "lastMessage.senderId",
        select: "displayName avatarUrl",
      })
      .populate({
        path: "seenBy",
        select: "displayName avatarUrl",
      });

    const formatted = conversations.map((convo) => {
      // 🔧 FIX: lọc bỏ participant mà user đã bị xóa khỏi DB (populate trả về null)
      const participants = (convo.participants || [])
        .filter((p) => p.userId)
        .map((p) => ({
          _id: p.userId._id,
          displayName: p.userId.displayName,
          avatarUrl: p.userId.avatarUrl ?? null,
          joinedAt: p.joinedAt,
        }));

      return {
        ...convo.toObject(),
        unreadCounts: convo.unreadCounts || {},
        participants,
      };
    });

    return res.status(200).json({ conversations: formatted });
  } catch (error) {
    console.error("Lỗi xảy ra khi lấy conversations", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { cursor } = req.query;
    const userId = req.user._id;

    // 🆕 id sai định dạng -> 400 thay vì lỗi 500 (CastError)
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "ID cuộc trò chuyện không hợp lệ" });
    }

    // 🔧 SỬA: giới hạn số tin nhắn mỗi lần tải (1..100) để không ai có thể
    // gọi limit=999999 kéo cả lịch sử chat về một lần.
    const parsedLimit = parseInt(req.query.limit, 10);
    const limit = Math.min(
      Math.max(Number.isNaN(parsedLimit) ? DEFAULT_MESSAGES_PER_PAGE : parsedLimit, 1),
      MAX_MESSAGES_PER_PAGE
    );

    // 🆕 cursor phải là ngày hợp lệ, nếu không -> 400
    let cursorDate = null;
    if (cursor) {
      cursorDate = new Date(cursor);
      if (Number.isNaN(cursorDate.getTime())) {
        return res.status(400).json({ message: "Cursor không hợp lệ" });
      }
    }

    const conversation = await Conversation.findById(conversationId).lean();

    if (!conversation) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }

    // 🔒 Chặn đọc tin nhắn của conversation mà mình không phải thành viên
    const isMember = (conversation.participants || []).some(
      (p) => p.userId.toString() === userId.toString()
    );

    if (!isMember) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền xem cuộc trò chuyện này" });
    }

    const query = { conversationId };

    // 🆕 MỚI THÊM: nếu user này đã từng "xóa" đoạn chat, chỉ trả về tin nhắn
    // tạo SAU thời điểm xóa gần nhất -> lịch sử cũ coi như biến mất vĩnh viễn
    // với riêng họ, dù dữ liệu thật vẫn còn nguyên cho người kia.
    // conversation.clearedFor là Map nên khi .lean() nó sẽ là plain object.
    const clearedAt = conversation.clearedFor?.[userId.toString()];

    if (cursorDate && clearedAt) {
      query.createdAt = { $lt: cursorDate, $gt: new Date(clearedAt) };
    } else if (cursorDate) {
      query.createdAt = { $lt: cursorDate };
    } else if (clearedAt) {
      query.createdAt = { $gt: new Date(clearedAt) };
    }

    let messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1);

    let nextCursor = null;

    if (messages.length > limit) {
      const nextMessage = messages[messages.length - 1];
      nextCursor = nextMessage.createdAt.toISOString();
      messages.pop();
    }

    messages = messages.reverse();

    return res.status(200).json({
      messages,
      nextCursor,
    });
  } catch (error) {
    console.error("Lỗi xảy ra khi lấy messages", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getUserConversationsForSocketIO = async (userId) => {
  try {
    const conversations = await Conversation.find(
      { "participants.userId": userId },
      { _id: 1 },
    );

    return conversations.map((c) => c._id.toString());
  } catch (error) {
    console.error("Lỗi khi fetch conversations: ", error);
    return [];
  }
};

export const markAsSeen = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id.toString();

    const conversation = await Conversation.findById(conversationId).lean();

    if (!conversation) {
      return res.status(404).json({ message: "Conversation không tồn tại" });
    }

    // 🔒 Chặn mark-as-seen trên conversation mà mình không phải thành viên
    const isMember = (conversation.participants || []).some(
      (p) => p.userId.toString() === userId
    );
    if (!isMember) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền thực hiện thao tác này" });
    }

    const last = conversation.lastMessage;

    if (!last) {
      return res.status(200).json({ message: "Không có tin nhắn để mark as seen" });
    }

    if (last.senderId.toString() === userId) {
      return res.status(200).json({ message: "Sender không cần mark as seen" });
    }

    const updated = await Conversation.findByIdAndUpdate(
      conversationId,
      {
        $addToSet: { seenBy: userId },
        $set: { [`unreadCounts.${userId}`]: 0 },
      },
      {
        new: true,
      },
    );

    io.to(conversationId).emit("read-message", {
      conversation: updated,
      lastMessage: {
        _id: updated?.lastMessage._id,
        content: updated?.lastMessage.content,
        createdAt: updated?.lastMessage.createdAt,
        sender: {
          _id: updated?.lastMessage.senderId,
        },
      },
    });

    return res.status(200).json({
      message: "Marked as seen",
      seenBy: updated?.seenBy || [],
      myUnreadCount: updated?.unreadCounts[userId] || 0,
    });
  } catch (error) {
    console.error("Lỗi khi mark as seen", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// 🆕 MỚI THÊM: "xóa" đoạn chat phía user hiện tại.
// - hiddenFor: ẩn khỏi sidebar của họ (không ảnh hưởng người còn lại)
// - clearedFor[userId] = now: mốc để getMessages lọc bỏ toàn bộ tin nhắn
//   cũ ra khỏi lịch sử của RIÊNG họ -> tạo cảm giác "mất hết", dù dữ liệu
//   thật (Message documents) vẫn còn nguyên, người kia vẫn xem được đủ.
// Đoạn chat CHỈ hiện lại phía họ khi CHÍNH họ chủ động tìm kiếm và nhắn tin
// lại (xem createConversation/sendDirectMessage) — người kia nhắn tới trước
// KHÔNG làm nó tự hiện lại.
export const hideConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;

    const conversation = await Conversation.findById(conversationId).lean();

    if (!conversation) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }

    const isMember = (conversation.participants || []).some(
      (p) => p.userId.toString() === userId.toString()
    );

    if (!isMember) {
      return res
        .status(403)
        .json({ message: "Bạn không ở trong đoạn chat này" });
    }

    await Conversation.findByIdAndUpdate(conversationId, {
      $addToSet: { hiddenFor: userId },
      $set: { [`clearedFor.${userId.toString()}`]: new Date() },
    });

    return res.status(200).json({ message: "Đã xóa đoạn chat" });
  } catch (error) {
    console.error("Lỗi khi xóa đoạn chat", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// 🆕 MỚI THÊM: thêm thành viên vào nhóm chat.
// - Chỉ áp dụng cho conversation type "group"
// - Người gọi phải là thành viên của nhóm (ai trong nhóm cũng thêm được)
// - Tự bỏ qua những người đã ở trong nhóm / id không hợp lệ / user không tồn tại
// - Người mới: nhận "new-group" + được join vào room conversation
// - Thành viên cũ: nhận "group-members-added" để cập nhật danh sách realtime
export const addGroupMembers = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { memberIds } = req.body;
    const userId = req.user._id.toString();

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return res
        .status(400)
        .json({ message: "Danh sách thành viên cần thêm là bắt buộc" });
    }

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }

    if (conversation.type !== "group") {
      return res
        .status(400)
        .json({ message: "Chỉ có thể thêm thành viên vào nhóm chat" });
    }

    const isMember = conversation.participants.some(
      (p) => p.userId.toString() === userId
    );

    if (!isMember) {
      return res.status(403).json({ message: "Bạn không ở trong nhóm này" });
    }

    const existingIds = new Set(
      conversation.participants.map((p) => p.userId.toString())
    );

    // loại trùng, loại id sai định dạng, loại người đã trong nhóm
    const candidateIds = [...new Set(memberIds.map(String))].filter(
      (id) => mongoose.Types.ObjectId.isValid(id) && !existingIds.has(id)
    );

    if (candidateIds.length === 0) {
      return res
        .status(400)
        .json({ message: "Những người này đã ở trong nhóm" });
    }

    // chỉ giữ lại user thật sự tồn tại trong DB
    const validUsers = await User.find({ _id: { $in: candidateIds } }).select("_id");
    const newIds = validUsers.map((u) => u._id.toString());

    if (newIds.length === 0) {
      return res.status(400).json({ message: "Không tìm thấy người dùng hợp lệ" });
    }

    newIds.forEach((id) => {
      conversation.participants.push({ userId: id });
    });

    await conversation.save();

    await conversation.populate([
      { path: "participants.userId", select: "displayName avatarUrl" },
      { path: "seenBy", select: "displayName avatarUrl" },
      { path: "lastMessage.senderId", select: "displayName avatarUrl" },
    ]);

    const participants = (conversation.participants || [])
      .filter((p) => p.userId)
      .map((p) => ({
        _id: p.userId._id,
        displayName: p.userId.displayName,
        avatarUrl: p.userId.avatarUrl ?? null,
        joinedAt: p.joinedAt,
      }));

    const formatted = { ...conversation.toObject(), participants };

    // 1) báo cho thành viên CŨ (đang ở trong room) trước, để người mới không nhận trùng
    io.to(conversationId).emit("group-members-added", {
      conversationId,
      participants,
    });

    // 2) người mới: nhận conversation + join room để nhận tin nhắn realtime
    newIds.forEach((id) => {
      io.to(id).emit("new-group", formatted);
      io.in(id).socketsJoin(conversationId);
    });

    return res.status(200).json({ participants });
  } catch (error) {
    console.error("Lỗi khi thêm thành viên vào nhóm", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// 🆕 MỚI THÊM: chủ nhóm kick 1 thành viên khỏi nhóm
export const removeGroupMember = async (req, res) => {
  try {
    const { conversationId, memberId } = req.params;
    const userId = req.user._id.toString();

    if (!mongoose.Types.ObjectId.isValid(memberId)) {
      return res.status(400).json({ message: "ID thành viên không hợp lệ" });
    }

    const conversation = await Conversation.findById(conversationId).lean();

    if (!conversation) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Chỉ áp dụng cho nhóm chat" });
    }

    if (conversation.group?.createdBy?.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "Chỉ chủ nhóm mới có quyền xóa thành viên" });
    }

    if (memberId === userId) {
      return res
        .status(400)
        .json({ message: "Chủ nhóm không thể tự xóa mình khỏi nhóm" });
    }

    const isMember = conversation.participants.some(
      (p) => p.userId.toString() === memberId
    );

    if (!isMember) {
      return res.status(404).json({ message: "Người này không ở trong nhóm" });
    }

    const updated = await Conversation.findByIdAndUpdate(
      conversationId,
      {
        $pull: { participants: { userId: memberId }, seenBy: memberId },
        $unset: { [`unreadCounts.${memberId}`]: "" },
      },
      { new: true }
    ).populate([
      { path: "participants.userId", select: "displayName avatarUrl" },
    ]);

    const participants = (updated.participants || [])
      .filter((p) => p.userId)
      .map((p) => ({
        _id: p.userId._id,
        displayName: p.userId.displayName,
        avatarUrl: p.userId.avatarUrl ?? null,
        joinedAt: p.joinedAt,
      }));

    // báo cho cả room nhóm + riêng người bị kick (socket.io tự loại trùng)
    io.to(conversationId).to(memberId).emit("group-member-removed", {
      conversationId,
      removedId: memberId,
      participants,
    });

    // cho tất cả socket của người bị kick rời room -> không nhận tin nhắn nhóm nữa
    io.in(memberId).socketsLeave(conversationId);

    return res.status(200).json({ participants });
  } catch (error) {
    console.error("Lỗi khi xóa thành viên khỏi nhóm", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// 🆕 MỚI THÊM: chủ nhóm xóa hẳn nhóm (xóa cho TẤT CẢ thành viên)
export const deleteGroup = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id.toString();

    const conversation = await Conversation.findById(conversationId).lean();

    if (!conversation) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Chỉ áp dụng cho nhóm chat" });
    }

    if (conversation.group?.createdBy?.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "Chỉ chủ nhóm mới có quyền xóa nhóm" });
    }

    const memberIds = conversation.participants.map((p) => p.userId.toString());

    // 🔧 SỬA: xóa luôn khoản chi, khoản trả nợ và lịch sử cuộc gọi của nhóm
    // (trước đây chỉ xóa tin nhắn nên các dữ liệu này bị bỏ lại mồ côi)
    await deleteConversationData(conversationId);
    await Conversation.findByIdAndDelete(conversationId);

    let emitter = io.to(conversationId);
    memberIds.forEach((id) => {
      emitter = emitter.to(id);
    });
    emitter.emit("group-deleted", { conversationId });

    io.in(conversationId).socketsLeave(conversationId);

    return res.status(200).json({ message: "Đã xóa nhóm" });
  } catch (error) {
    console.error("Lỗi khi xóa nhóm", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// 🆕 MỚI THÊM: thành viên TỰ RỜI nhóm.
// - Người cuối cùng rời -> xóa hẳn nhóm
// - Chủ nhóm rời -> chuyển quyền chủ nhóm cho thành viên vào nhóm sớm nhất
// - Gỡ luôn dấu vết của người rời trong seenBy / unreadCounts / hiddenFor / clearedFor
export const leaveGroup = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id.toString();

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "ID nhóm không hợp lệ" });
    }

    const conversation = await Conversation.findById(conversationId).lean();

    if (!conversation) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Chỉ áp dụng cho nhóm chat" });
    }

    const isMember = conversation.participants.some(
      (p) => p.userId.toString() === userId
    );

    if (!isMember) {
      return res.status(403).json({ message: "Bạn không ở trong nhóm này" });
    }

    const remaining = conversation.participants.filter(
      (p) => p.userId.toString() !== userId
    );

    // Người cuối cùng rời -> không còn ai nữa, xóa hẳn nhóm
    if (remaining.length === 0) {
      // 🔧 SỬA: dọn luôn khoản chi, khoản trả nợ, lịch sử cuộc gọi (giống deleteGroup)
      await deleteConversationData(conversationId);
      await Conversation.findByIdAndDelete(conversationId);

      io.in(userId).socketsLeave(conversationId);

      return res.status(200).json({ message: "Đã rời nhóm", deleted: true });
    }

    // Chủ nhóm rời -> chọn người vào nhóm sớm nhất làm chủ nhóm mới
    const wasOwner = conversation.group?.createdBy?.toString() === userId;
    let newOwnerId = null;

    if (wasOwner) {
      const next = [...remaining].sort(
        (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
      )[0];
      newOwnerId = next.userId.toString();
    }

    const update = {
      $pull: { participants: { userId }, seenBy: userId, hiddenFor: userId },
      $unset: {
        [`unreadCounts.${userId}`]: "",
        [`clearedFor.${userId}`]: "",
      },
    };

    if (newOwnerId) {
      update.$set = { "group.createdBy": newOwnerId };
    }

    const updated = await Conversation.findByIdAndUpdate(conversationId, update, {
      new: true,
    }).populate([{ path: "participants.userId", select: "displayName avatarUrl" }]);

    const participants = (updated.participants || [])
      .filter((p) => p.userId)
      .map((p) => ({
        _id: p.userId._id,
        displayName: p.userId.displayName,
        avatarUrl: p.userId.avatarUrl ?? null,
        joinedAt: p.joinedAt,
      }));

    // báo cho cả room (gồm cả các tab khác của chính người rời)
    io.to(conversationId).emit("group-member-left", {
      conversationId,
      leftId: userId,
      leftName: req.user.displayName,
      participants,
      newOwnerId, // null nếu chủ nhóm không đổi
    });

    // người rời không còn nhận tin nhắn nhóm nữa
    io.in(userId).socketsLeave(conversationId);

    return res.status(200).json({ message: "Đã rời nhóm", deleted: false });
  } catch (error) {
    console.error("Lỗi khi rời nhóm", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};