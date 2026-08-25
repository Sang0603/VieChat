import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import {
  emitNewMessage,
  emitReactionUpdate, // 👈 mới thêm
  updateConversationAfterCreateMessage,
} from "../utils/messageHelper.js";
import { io } from "../socket/index.js";
import { uploadImageFromBuffer } from "../middlewares/uploadMiddleware.js";

export const uploadChatImage = async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "Chưa chọn file ảnh" });
    }

    const result = await uploadImageFromBuffer(file.buffer, {
      folder: "Moji_chat/messages",
      transformation: [{ width: 1280, crop: "limit" }],
    });

    return res.status(200).json({ imgUrl: result.secure_url });
  } catch (error) {
    console.error("Lỗi xảy ra khi upload ảnh tin nhắn", error);
    return res.status(500).json({ message: "Upload ảnh thất bại" });
  }
};

// gắn thông tin replyTo (đã populate gọn) vào message trả về cho client
const attachReplyPreview = async (message) => {
  await message.populate({
    path: "replyTo",
    select: "content imgUrl senderId",
    populate: { path: "senderId", select: "displayName" },
  });

  const plain = message.toObject();

  if (plain.replyTo) {
    plain.replyTo = {
      _id: plain.replyTo._id,
      content: plain.replyTo.content,
      imgUrl: plain.replyTo.imgUrl,
      senderId: plain.replyTo.senderId?._id ?? plain.replyTo.senderId,
      senderName: plain.replyTo.senderId?.displayName,
    };
  }

  return plain;
};

export const sendDirectMessage = async (req, res) => {
  try {
    const { recipientId, content, imgUrl, conversationId, replyTo } = req.body;
    const senderId = req.user._id;

    let conversation;

    if (!content && !imgUrl) {
      return res.status(400).json({ message: "Cần có nội dung hoặc ảnh" });
    }

    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
    }

    if (!conversation) {
      conversation = await Conversation.create({
        type: "direct",
        participants: [
          { userId: senderId, joinedAt: new Date() },
          { userId: recipientId, joinedAt: new Date() },
        ],
        lastMessageAt: new Date(),
        unreadCounts: new Map(),
      });
    }

    const message = await Message.create({
      conversationId: conversation._id,
      senderId,
      content,
      imgUrl,
      replyTo: replyTo || undefined,
    });

    const formattedMessage = await attachReplyPreview(message);

    updateConversationAfterCreateMessage(conversation, message, senderId);

    await conversation.save();

    emitNewMessage(io, conversation, formattedMessage);

    return res.status(201).json({ message: formattedMessage });
  } catch (error) {
    console.error("Lỗi xảy ra khi gửi tin nhắn trực tiếp", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const sendGroupMessage = async (req, res) => {
  try {
    const { conversationId, content, imgUrl, replyTo } = req.body;
    const senderId = req.user._id;
    const conversation = req.conversation;

    if (!content && !imgUrl) {
      return res.status(400).json({ message: "Cần có nội dung hoặc ảnh" });
    }

    const message = await Message.create({
      conversationId,
      senderId,
      content,
      imgUrl,
      replyTo: replyTo || undefined,
    });

    const formattedMessage = await attachReplyPreview(message);

    updateConversationAfterCreateMessage(conversation, message, senderId);

    await conversation.save();
    emitNewMessage(io, conversation, formattedMessage);

    return res.status(201).json({ message: formattedMessage });
  } catch (error) {
    console.error("Lỗi xảy ra khi gửi tin nhắn nhóm", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// 👇 MỚI THÊM: thả / đổi / gỡ reaction cho một tin nhắn
// - Nếu user chưa có reaction trên message này -> thêm mới
// - Nếu user đã thả cùng 1 emoji -> bấm lại để gỡ (toggle off)
// - Nếu user đã thả emoji khác -> đổi sang emoji mới
export const toggleReaction = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;

    if (!emoji) {
      return res.status(400).json({ message: "Thiếu emoji" });
    }

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: "Không tìm thấy tin nhắn" });
    }

    const conversation = await Conversation.findById(message.conversationId);

    if (!conversation) {
      return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
    }

    const isMember = conversation.participants.some(
      (p) => p.userId.toString() === userId.toString()
    );

    if (!isMember) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền thực hiện thao tác này" });
    }

    const existingIndex = message.reactions.findIndex(
      (r) => r.userId.toString() === userId.toString()
    );

    if (existingIndex !== -1) {
      if (message.reactions[existingIndex].emoji === emoji) {
        // bấm lại cùng emoji -> gỡ reaction
        message.reactions.splice(existingIndex, 1);
      } else {
        // đổi sang emoji khác
        message.reactions[existingIndex].emoji = emoji;
      }
    } else {
      message.reactions.push({ userId, emoji });
    }

    await message.save();

    emitReactionUpdate(io, conversation, message);

    return res.status(200).json({ reactions: message.reactions });
  } catch (error) {
    console.error("Lỗi xảy ra khi thả reaction", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};