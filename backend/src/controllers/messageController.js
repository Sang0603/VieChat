import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Block from "../models/Block.js";
import {
  emitNewMessage,
  emitReactionUpdate,
  updateConversationAfterCreateMessage,
} from "../utils/messageHelper.js";
import { io } from "../socket/index.js";
import {
  uploadImageFromBuffer,
  uploadVideoFromPath, // 👈 MỚI THÊM
} from "../middlewares/uploadMiddleware.js";

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

// 👇 MỚI THÊM: upload video tin nhắn (chỉ upload lên Cloudinary + trả url,
// KHÔNG tạo Message ở đây — client sẽ gọi sendDirectMessage/sendGroupMessage
// sau, giống hệt luồng ảnh hiện tại)
export const uploadChatVideo = async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "Chưa chọn file video" });
    }

    const result = await uploadVideoFromPath(file.path);

    return res.status(200).json({
      videoUrl: result.secure_url,
      thumbnailUrl: result.eager?.[0]?.secure_url ?? null,
      duration: result.duration ?? null, // giây
    });
  } catch (error) {
    console.error("Lỗi xảy ra khi upload video tin nhắn", error);
    return res.status(500).json({ message: "Upload video thất bại" });
  }
};

const attachReplyPreview = async (message) => {
  await message.populate({
    path: "replyTo",
    select: "content imgUrl videoUrl thumbnailUrl senderId", // 👈 thêm videoUrl, thumbnailUrl
    populate: { path: "senderId", select: "displayName" },
  });

  const plain = message.toObject();

  if (plain.replyTo) {
    plain.replyTo = {
      _id: plain.replyTo._id,
      content: plain.replyTo.content,
      imgUrl: plain.replyTo.imgUrl,
      videoUrl: plain.replyTo.videoUrl, // 👈 MỚI THÊM
      senderId: plain.replyTo.senderId?._id ?? plain.replyTo.senderId,
      senderName: plain.replyTo.senderId?.displayName,
    };
  }

  return plain;
};

export const sendDirectMessage = async (req, res) => {
  try {
    const {
      recipientId,
      content,
      imgUrl,
      videoUrl, // 👈 MỚI THÊM
      thumbnailUrl, // 👈 MỚI THÊM
      duration, // 👈 MỚI THÊM
      conversationId,
      replyTo,
    } = req.body;
    const senderId = req.user._id;

    if (!content && !imgUrl && !videoUrl) {
      return res.status(400).json({ message: "Cần có nội dung, ảnh hoặc video" });
    }

    let conversation;

    if (conversationId) {
      conversation = await Conversation.findById(conversationId);

      if (!conversation) {
        return res.status(404).json({ message: "Không tìm thấy cuộc trò chuyện" });
      }

      const isMember = conversation.participants.some(
        (p) => p.userId.toString() === senderId.toString()
      );
      if (!isMember || conversation.type !== "direct") {
        return res
          .status(403)
          .json({ message: "Bạn không có quyền gửi tin nhắn vào cuộc trò chuyện này" });
      }
    } else {
      if (!recipientId) {
        return res.status(400).json({ message: "Thiếu recipientId" });
      }

      conversation = await Conversation.findOne({
        type: "direct",
        "participants.userId": { $all: [senderId, recipientId] },
        participants: { $size: 2 },
      });

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
    }

    const otherUserId =
      conversation.participants
        .map((p) => p.userId.toString())
        .find((id) => id !== senderId.toString()) || recipientId;

    if (otherUserId) {
      const [blockedByMe, blockedMe] = await Promise.all([
        Block.exists({ blocker: senderId, blocked: otherUserId }),
        Block.exists({ blocker: otherUserId, blocked: senderId }),
      ]);

      if (blockedByMe || blockedMe) {
        return res.status(403).json({
          message: "Không thể gửi tin nhắn cho người này",
          blocked: true,
          blockedByMe: Boolean(blockedByMe),
          blockedMe: Boolean(blockedMe),
        });
      }
    }

    if (replyTo) {
      const repliedMessage = await Message.findById(replyTo).select("conversationId");
      if (
        !repliedMessage ||
        repliedMessage.conversationId.toString() !== conversation._id.toString()
      ) {
        return res.status(400).json({ message: "replyTo không hợp lệ" });
      }
    }

    const message = await Message.create({
      conversationId: conversation._id,
      senderId,
      content,
      imgUrl,
      videoUrl, // 👈 MỚI THÊM
      thumbnailUrl, // 👈 MỚI THÊM
      duration, // 👈 MỚI THÊM
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
    const {
      conversationId,
      content,
      imgUrl,
      videoUrl, // 👈 MỚI THÊM
      thumbnailUrl, // 👈 MỚI THÊM
      duration, // 👈 MỚI THÊM
      replyTo,
    } = req.body;
    const senderId = req.user._id;
    const conversation = req.conversation;

    if (!content && !imgUrl && !videoUrl) {
      return res.status(400).json({ message: "Cần có nội dung, ảnh hoặc video" });
    }

    if (replyTo) {
      const repliedMessage = await Message.findById(replyTo).select("conversationId");
      if (
        !repliedMessage ||
        repliedMessage.conversationId.toString() !== conversationId.toString()
      ) {
        return res.status(400).json({ message: "replyTo không hợp lệ" });
      }
    }

    const message = await Message.create({
      conversationId,
      senderId,
      content,
      imgUrl,
      videoUrl, // 👈 MỚI THÊM
      thumbnailUrl, // 👈 MỚI THÊM
      duration, // 👈 MỚI THÊM
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
        message.reactions.splice(existingIndex, 1);
      } else {
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