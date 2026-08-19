import Friend from "../models/Friend.js";
import User from "../models/User.js";
import FriendRequest from "../models/FriendRequest.js";
import Conversation from "../models/Conversation.js";
import { io } from "../socket/index.js";

export const sendFriendRequest = async (req, res) => {
  try {
    const { to, message } = req.body;

    const from = req.user._id;

    if (from === to) {
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

    // báo realtime cho người NHẬN biết có lời mời kết bạn mới
    // -> frontend lắng nghe event này để hiện chấm đỏ / badge thông báo ngay lập tức
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

    // Tạo (hoặc tái sử dụng nếu đã có, ví dụ do từng unfriend rồi kết bạn lại)
    // Conversation type "direct" giữa 2 người ngay khi kết bạn thành công.
    // Vì sidebar "BẠN BÈ" ở frontend thực chất render từ useChatStore().conversations
    // (lọc type === "direct"), nên nếu không tạo conversation ở đây, người mới kết bạn
    // sẽ không hiện trong sidebar cho tới khi có tin nhắn đầu tiên.
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

    // QUAN TRỌNG: populate rồi FLATTEN participants[].userId thành top-level
    // {_id, displayName, avatarUrl, joinedAt} - phải giống HỆT shape mà
    // getConversations() và createConversation() trả về (conversationController.js).
    // Nếu emit thẳng document Mongoose (participants[].userId lồng nhau),
    // frontend (DirectMessageCard.tsx dùng `p._id`) sẽ không tìm thấy _id
    // vì nó nằm trong p.userId._id, không phải p._id trực tiếp.
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

    // báo realtime cho người đã GỬI lời mời (A) biết là đã được chấp nhận,
    // để A tự động thấy người này (B) xuất hiện trong danh sách bạn bè ngay,
    // không cần load lại trang
    io.to(request.from.toString()).emit("friend-request-accepted", {
      requestId,
      friend: {
        _id: req.user._id,
        displayName: req.user.displayName,
        username: req.user.username,
        avatarUrl: req.user.avatarUrl,
      },
    });

    // báo realtime cho chính người CHẤP NHẬN (B) nếu họ đang mở nhiều tab/thiết bị,
    // để mọi tab đều cập nhật friend list + gỡ request khỏi danh sách chờ ngay lập tức
    io.to(request.to.toString()).emit("friend-request-accepted-self", {
      requestId,
      friend: {
        _id: from?._id,
        displayName: from?.displayName,
        username: from?.username,
        avatarUrl: from?.avatarUrl,
      },
    });

    // báo cho cả 2 phía: có conversation mới, để frontend đẩy thẳng vào
    // useChatStore().conversations mà không cần reload trang
    // (dùng formattedConversation đã flatten participants ở trên, cùng shape với REST API)
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

    const friendships = await Friend.find({
      $or: [
        {
          userA: userId,
        },
        {
          userB: userId,
        },
      ],
    })
      .populate("userA", "_id displayName avatarUrl username")
      .populate("userB", "_id displayName avatarUrl username")
      .lean();

    if (!friendships.length) {
      return res.status(200).json({ friends: [] });
    }

    const friends = friendships.map((f) =>
      f.userA._id.toString() === userId.toString() ? f.userB : f.userA
    );

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