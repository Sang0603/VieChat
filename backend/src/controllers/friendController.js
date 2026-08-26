import Friend from "../models/Friend.js";
import User from "../models/User.js";
import FriendRequest from "../models/FriendRequest.js";
import Conversation from "../models/Conversation.js";
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

    await Friend.create({
      userA: request.from,
      userB: request.to,
    });

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

    const participants = (conversation.participants || []).map((p) => ({
      _id: p.userId?._id,
      displayName: p.userId?.displayName,
      avatarUrl: p.userId?.avatarUrl ?? null,
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

    const isFriend = await Friend.exists({ userA, userB });
    if (!isFriend) {
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