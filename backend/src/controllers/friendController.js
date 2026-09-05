import Friend from "../models/Friend.js";
import User from "../models/User.js";
import FriendRequest from "../models/FriendRequest.js";
import Conversation from "../models/Conversation.js";
import Block from "../models/Block.js";
import { io } from "../socket/index.js";

// Helper: format Date -> "dd/mm/yyyy"
const formatDate = (date) => {
  if (!date) return undefined;
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// Helper: chuyển 1 User document thành profile công khai cho bạn bè xem,
// áp dụng privacy.showPhone / privacy.showDateOfBirth
const toFriendProfile = (user) => {
  const showPhone = user.privacy?.showPhone !== false;
  const showDob = user.privacy?.showDateOfBirth !== false;

  return {
    _id: user._id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    gender: user.gender,
    dateOfBirth: showDob ? formatDate(user.dateOfBirth) : undefined,
    dateOfBirthHidden: !showDob,
    phone: showPhone ? user.phone : undefined,
    phoneHidden: !showPhone,
  };
};

// 🔒 kiểm tra 2 người có đang chặn nhau không (theo 1 trong 2 chiều)
const isBlockedBetween = async (userIdA, userIdB) => {
  const blocked = await Block.exists({
    $or: [
      { blocker: userIdA, blocked: userIdB },
      { blocker: userIdB, blocked: userIdA },
    ],
  });
  return Boolean(blocked);
};

export const sendFriendRequest = async (req, res) => {
  try {
    const { to, message } = req.body;

    const from = req.user._id;

    if (from.toString() === to) {
      return res
        .status(400)
        .json({ message: "Không thể gửi lời mời kết bạn cho chính mình" });
    }

    const userExists = await User.exists({ _id: to });

    if (!userExists) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    // 🔒 Nếu 2 người đang chặn nhau: báo lỗi giống "không tìm thấy" để
    // không lộ việc bị chặn (giống Zalo, không tiết lộ trạng thái block)
    if (await isBlockedBetween(from, to)) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    let userA = from.toString();
    let userB = to.toString();

    if (userA > userB) {
      [userA, userB] = [userB, userA];
    }

    const [alreadyFriends, existingRequest] = await Promise.all([
      Friend.findOne({ userA, userB }),
      FriendRequest.findOne({
        $or: [
          { from, to },
          { from: to, to: from },
        ],
      }),
    ]);

    if (alreadyFriends) {
      return res.status(400).json({ message: "Hai người đã là bạn bè" });
    }

    if (existingRequest) {
      return res.status(400).json({ message: "Đã có lời mời kết bạn đang chờ" });
    }

    const request = await FriendRequest.create({
      from,
      to,
      message,
    });

    io.to(to.toString()).emit("friend-request-received", {
      request: {
        _id: request._id,
        from: {
          _id: req.user._id,
          displayName: req.user.displayName,
          username: req.user.username,
          avatarUrl: req.user.avatarUrl,
        },
        to,
        message: request.message,
        createdAt: request.createdAt,
      },
    });

    return res
      .status(201)
      .json({ message: "Gửi lời mời kết bạn thành công", request });
  } catch (error) {
    console.error("Lỗi khi gửi yêu cầu kết bạn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const acceptFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user._id;

    const request = await FriendRequest.findById(requestId);

    if (!request) {
      return res.status(404).json({ message: "Không tìm thấy lời mời kết bạn" });
    }

    if (request.to.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền chấp nhận lời mời này" });
    }

    // 🔧 FIX: đã sort userA/userB trước khi tạo Friend (giống mọi chỗ khác
    // trong file này) — trước đây tạo trực tiếp userA: request.from,
    // userB: request.to mà không sort, khiến middleware checkFriendship
    // (query có sort) không tìm thấy record, báo "chưa kết bạn" sai
    let userA = request.from.toString();
    let userB = request.to.toString();
    if (userA > userB) [userA, userB] = [userB, userA];

    await Friend.create({ userA, userB });

    let conversation = await Conversation.findOne({
      type: "direct",
      "participants.userId": { $all: [request.from, request.to] },
      participants: { $size: 2 },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        type: "direct",
        participants: [
          { userId: request.from },
          { userId: request.to },
        ],
      });
    }

    await conversation.populate({
      path: "participants.userId",
      select: "displayName avatarUrl",
    });

    // 🔧 FIX: lọc bỏ participant mà user đã bị xóa khỏi DB (populate trả về null)
    const participants = (conversation.participants || [])
      .filter((p) => p.userId)
      .map((p) => ({
        _id: p.userId._id,
        displayName: p.userId.displayName,
        avatarUrl: p.userId.avatarUrl ?? null,
        joinedAt: p.joinedAt,
      }));

    const formattedConversation = { ...conversation.toObject(), participants };

    await FriendRequest.findByIdAndDelete(requestId);

    const from = await User.findById(request.from)
      .select("_id displayName username avatarUrl")
      .lean();

    io.to(request.from.toString()).emit("friend-request-accepted", {
      requestId,
      friend: {
        _id: req.user._id,
        displayName: req.user.displayName,
        username: req.user.username,
        avatarUrl: req.user.avatarUrl,
      },
    });

    io.to(request.to.toString()).emit("friend-request-accepted-self", {
      requestId,
      friend: {
        _id: from?._id,
        displayName: from?.displayName,
        username: from?.username,
        avatarUrl: from?.avatarUrl,
      },
    });

    io.to(request.from.toString()).emit("conversation-created", {
      conversation: formattedConversation,
    });
    io.to(request.to.toString()).emit("conversation-created", {
      conversation: formattedConversation,
    });

    return res.status(200).json({
      message: "Chấp nhận lời mời kết bạn thành công",
      newFriend: {
        _id: from?._id,
        displayName: from?.displayName,
        username: from?.username,
        avatarUrl: from?.avatarUrl,
      },
      conversation: formattedConversation,
    });
  } catch (error) {
    console.error("Lỗi khi chấp nhận lời mời kết bạn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const declineFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user._id;

    const request = await FriendRequest.findById(requestId);

    if (!request) {
      return res.status(404).json({ message: "Không tìm thấy lời mời kết bạn" });
    }

    if (request.to.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền từ chối lời mời này" });
    }

    await FriendRequest.findByIdAndDelete(requestId);

    return res.sendStatus(204);
  } catch (error) {
    console.error("Lỗi khi từ chối lời mời kết bạn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getAllFriends = async (req, res) => {
  try {
    const userId = req.user._id;

    const populateFields =
      "_id displayName avatarUrl username bio gender dateOfBirth phone privacy";

    const friendships = await Friend.find({
      $or: [{ userA: userId }, { userB: userId }],
    })
      .populate("userA", populateFields)
      .populate("userB", populateFields)
      .lean();

    if (!friendships.length) {
      return res.status(200).json({ friends: [] });
    }

    const friends = friendships.map((f) => {
      const rawFriend =
        f.userA._id.toString() === userId.toString() ? f.userB : f.userA;
      return toFriendProfile(rawFriend);
    });

    return res.status(200).json({ friends });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách bạn bè", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getFriendRequests = async (req, res) => {
  try {
    const userId = req.user._id;

    const populateFields = "_id username displayName avatarUrl";

    const [sent, received] = await Promise.all([
      FriendRequest.find({ from: userId }).populate("to", populateFields),
      FriendRequest.find({ to: userId }).populate("from", populateFields),
    ]);

    res.status(200).json({ sent, received });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách yêu cầu kết bạn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getFriendProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { friendId } = req.params;

    let userA = userId.toString();
    let userB = friendId.toString();
    if (userA > userB) [userA, userB] = [userB, userA];

    const [isFriend, hasBlockRelation, sharedConversation] = await Promise.all([
      Friend.exists({ userA, userB }),
      Block.exists({
        $or: [
          { blocker: userId, blocked: friendId },
          { blocker: friendId, blocked: userId },
        ],
      }),
      Conversation.exists({
        type: "direct",
        "participants.userId": { $all: [userId, friendId] },
      }),
    ]);

    // 🔒 Cho xem profile nếu: đang là bạn bè, HOẶC đang có quan hệ chặn (để
    // hiện nút bỏ chặn), HOẶC đã từng có cuộc trò chuyện với nhau (giống
    // Zalo/Messenger - xem được profile của bất kỳ ai mình từng chat cùng,
    // không bắt buộc phải đang kết bạn)
    if (!isFriend && !hasBlockRelation && !sharedConversation) {
      return res.status(403).json({ message: "Hai người chưa là bạn bè" });
    }

    const user = await User.findById(friendId)
      .select("_id displayName avatarUrl username bio gender dateOfBirth phone privacy")
      .lean();

    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    return res.status(200).json({ friend: toFriendProfile(user) });
  } catch (error) {
    console.error("Lỗi khi lấy hồ sơ bạn bè", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const blockFriend = async (req, res) => {
  try {
    const userId = req.user._id;
    const { friendId } = req.params;

    if (userId.toString() === friendId) {
      return res.status(400).json({ message: "Không thể tự chặn chính mình" });
    }

    let userA = userId.toString();
    let userB = friendId.toString();
    if (userA > userB) [userA, userB] = [userB, userA];

    await Promise.all([
      Block.updateOne(
        { blocker: userId, blocked: friendId },
        { $setOnInsert: { blocker: userId, blocked: friendId } },
        { upsert: true }
      ),
      Friend.deleteOne({ userA, userB }),
    ]);

    io.to(friendId.toString()).emit("friend-removed", { friendId: userId });
    io.to(userId.toString()).emit("friend-removed", { friendId });

    // 👇 MỚI THÊM: báo real-time cho người BỊ chặn biết ngay, không cần load lại trang
    io.to(friendId.toString()).emit("user-blocked", { by: userId });

    return res.status(200).json({ message: "Đã chặn người dùng" });
  } catch (error) {
    console.error("Lỗi khi chặn bạn bè", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const unfriendUser = async (req, res) => {
  try {
    const userId = req.user._id;
    const { friendId } = req.params;

    let userA = userId.toString();
    let userB = friendId.toString();
    if (userA > userB) [userA, userB] = [userB, userA];

    const result = await Friend.deleteOne({ userA, userB });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Hai người chưa là bạn bè" });
    }

    io.to(friendId.toString()).emit("friend-removed", { friendId: userId });
    io.to(userId.toString()).emit("friend-removed", { friendId });

    return res.status(200).json({ message: "Đã xóa khỏi danh sách bạn bè" });
  } catch (error) {
    console.error("Lỗi khi xóa bạn bè", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getBlockedUsers = async (req, res) => {
  try {
    const userId = req.user._id;

    const blocks = await Block.find({ blocker: userId })
      .populate("blocked", "_id displayName username avatarUrl")
      .sort({ createdAt: -1 })
      .lean();

    const blockedUsers = blocks
      .filter((b) => b.blocked)
      .map((b) => ({
        _id: b.blocked._id,
        displayName: b.blocked.displayName,
        username: b.blocked.username,
        avatarUrl: b.blocked.avatarUrl,
        blockedAt: b.createdAt,
      }));

    return res.status(200).json({ blockedUsers });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách người bị chặn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const unblockUser = async (req, res) => {
  try {
    const userId = req.user._id;
    const { userId: targetUserId } = req.params;

    const result = await Block.deleteOne({ blocker: userId, blocked: targetUserId });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Người dùng này chưa bị chặn" });
    }

    // 👇 MỚI THÊM: báo real-time cho người vừa được bỏ chặn
    io.to(targetUserId.toString()).emit("user-unblocked", { by: userId });

    return res.status(200).json({ message: "Đã bỏ chặn người dùng" });
  } catch (error) {
    console.error("Lỗi khi bỏ chặn người dùng", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getBlockStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const { friendId } = req.params;

    const [blockedByMe, blockedMe] = await Promise.all([
      Block.exists({ blocker: userId, blocked: friendId }),
      Block.exists({ blocker: friendId, blocked: userId }),
    ]);

    return res.status(200).json({
      blockedByMe: Boolean(blockedByMe),
      blockedMe: Boolean(blockedMe),
    });
  } catch (error) {
    console.error("Lỗi khi kiểm tra trạng thái chặn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};