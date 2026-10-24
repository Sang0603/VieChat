// src/socket/groupCallSocketHandlers.js
// Signaling cho GỌI NHÓM (mesh WebRTC). Server chỉ chuyển tiếp offer/answer/ICE,
// âm thanh/hình ảnh đi thẳng giữa các trình duyệt.

import Conversation from "../models/Conversation.js";

// key: conversationId
// value: { callType, memberIds: string[], participants: Set<string>, startedBy }
const groupCalls = new Map();

function extractMemberIds(conversation) {
  return conversation.participants.map((p) => (p.userId ?? p._id ?? p).toString());
}

export function registerGroupCallHandlers(io, socket, userSocketMap) {
  const userId = socket.user._id.toString();

  // Rời khỏi 1 cuộc gọi nhóm (dùng cho cả leave lẫn disconnect)
  function leaveCall(conversationId) {
    const call = groupCalls.get(conversationId);
    if (!call || !call.participants.has(userId)) return;

    call.participants.delete(userId);
    call.participants.forEach((id) => {
      io.to(id).emit("group-call:peer-left", { conversationId, userId });
    });

    // Hết người -> đóng phòng, báo cho các thành viên đang còn hiện popup "cuộc gọi đến"
    if (call.participants.size === 0) {
      groupCalls.delete(conversationId);
      call.memberIds.forEach((id) => {
        io.to(id).emit("group-call:ended", { conversationId });
      });
    }
  }

  // Bắt đầu cuộc gọi mới HOẶC tham gia cuộc gọi đang có
  socket.on("group-call:join", async ({ conversationId, callType = "audio" }) => {
    if (!conversationId) return;

    let call = groupCalls.get(conversationId);
    let isNew = false;
    let groupName = "";

    if (!call) {
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || conversation.type !== "group") return;

      call = groupCalls.get(conversationId); // kiểm tra lại, tránh 2 người gọi cùng lúc
      if (!call) {
        call = {
          callType,
          memberIds: extractMemberIds(conversation),
          participants: new Set(),
          startedBy: userId,
        };
        groupCalls.set(conversationId, call);
        isNew = true;
        groupName = conversation.group?.name ?? "";
      }
    }

    // Không phải thành viên nhóm -> không cho vào
    if (!call.memberIds.includes(userId)) {
      if (call.participants.size === 0) groupCalls.delete(conversationId);
      return;
    }

    if (call.participants.has(userId)) return;

    const existingPeers = Array.from(call.participants);
    call.participants.add(userId);

    // Báo cho người vừa vào: hãy tạo offer tới những người này
    socket.emit("group-call:participants", {
      conversationId,
      callType: call.callType,
      peers: existingPeers,
    });

    // Báo cho những người đang trong cuộc gọi
    existingPeers.forEach((id) => {
      io.to(id).emit("group-call:peer-joined", { conversationId, userId });
    });

    // Cuộc gọi mới -> rung chuông các thành viên còn lại
    if (isNew) {
      call.memberIds
        .filter((id) => id !== userId)
        .forEach((id) => {
          io.to(id).emit("group-call:incoming", {
            conversationId,
            callType: call.callType,
            groupName,
            fromUser: {
              _id: userId,
              displayName: socket.user.displayName,
              avatarUrl: socket.user.avatarUrl,
            },
          });
        });
    }
  });

  // Relay offer / answer / ice-candidate tới đúng 1 người
  socket.on("group-call:signal", ({ conversationId, toUserId, data }) => {
    const call = groupCalls.get(conversationId);
    if (!call) return;
    if (!call.participants.has(userId) || !call.participants.has(toUserId)) return;

    io.to(toUserId).emit("group-call:signal", {
      conversationId,
      fromUserId: userId,
      data,
    });
  });

  socket.on("group-call:leave", ({ conversationId }) => {
    leaveCall(conversationId);
  });

  socket.on("disconnect", () => {
    // Nếu user đã có socket mới (StrictMode / reload nhanh) thì bỏ qua socket cũ
    if (userSocketMap.get(userId) !== socket.id) return;

    for (const conversationId of Array.from(groupCalls.keys())) {
      leaveCall(conversationId);
    }
  });
}