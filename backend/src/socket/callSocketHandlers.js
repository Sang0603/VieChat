// src/socket/callSocketHandlers.js
//
// Xử lý các sự kiện socket liên quan tới GỌI THOẠI (WebRTC signaling).
// File này KHÔNG truyền âm thanh - chỉ chuyển tiếp (relay) các thông điệp
// "làm quen" giữa 2 peer (offer/answer/ICE candidate) để họ tự kết nối
// trực tiếp (P2P) với nhau qua WebRTC.
//
// Khi cuộc gọi kết thúc (bất kể lý do), file này còn:
//   1. Lưu CallLog (thống kê nội bộ)
//   2. Tạo 1 Message type="call" trong đúng conversation
//   3. Cập nhật lastMessage/unreadCounts của conversation (dùng chung
//      helper với tin nhắn thường - updateConversationAfterCreateMessage)
//   4. Emit "new-message" qua room conversation._id, giống hệt luồng
//      sendDirectMessage/sendGroupMessage hiện có (emitNewMessage)
//
// CÁCH DÙNG: import và gọi registerCallHandlers(io, socket, userSocketMap)
// bên trong file socket/index.js hiện tại của bạn, ngay trong khối
// io.on("connection", (socket) => { ... }) — xem hướng dẫn tích hợp
// ở cuối file.

import CallLog from "../models/CallLog.js";
import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";
import Block from "../models/Block.js";
import {
  emitNewMessage,
  updateConversationAfterCreateMessage,
} from "../utils/messageHelper.js";

// Lưu trạng thái các cuộc gọi đang diễn ra trong bộ nhớ (RAM)
// key: callId, value: { callerId, calleeId, conversationId, callType, startedAt }
const activeCalls = new Map();

function makeCallId(userIdA, userIdB) {
  return [userIdA, userIdB].sort().join(":");
}

function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m} phút ${s} giây`;
}

// Nội dung fallback hiển thị ở sidebar (preview tin nhắn cuối), vì
// content của message "call" vốn không có text. UI trong khung chat
// (MessageItem.tsx) sẽ tự render đẹp hơn dựa theo callInfo, không dùng content này.
function buildCallPreviewText(callType, status, durationInSeconds) {
  const label = callType === "video" ? "Cuộc gọi video" : "Cuộc gọi thoại";
  if (status === "completed") return `${label} · ${formatDuration(durationInSeconds)}`;
  if (status === "missed") return `${label} nhỡ`;
  if (status === "cancelled") return `${label} nhỡ`;
  return `${label} bị từ chối`;
}

// 🔒 kiểm tra 2 người có đang chặn nhau không (theo 1 trong 2 chiều)
async function isBlockedBetween(userIdA, userIdB) {
  const blocked = await Block.exists({
    $or: [
      { blocker: userIdA, blocked: userIdB },
      { blocker: userIdB, blocked: userIdA },
    ],
  });
  return Boolean(blocked);
}

/**
 * @param {import("socket.io").Server} io
 * @param {import("socket.io").Socket} socket - socket của client vừa connect
 * @param {Map<string,string>} userSocketMap - map userId -> socketId (dùng để relay signaling 1-1: invite/offer/answer/ice)
 */
export function registerCallHandlers(io, socket, userSocketMap) {
  // socketAuthMiddleware.js gắn sẵn socket.user (object User đầy đủ), lấy _id ra dùng
  const currentUserId = socket.user._id.toString();

  // Lưu CallLog + tạo Message "call" + cập nhật conversation + emit "new-message"
  async function finalizeCall(call, status) {
    try {
      const endedAt = new Date();
      const durationInSeconds = call.startedAt
        ? Math.max(0, Math.round((endedAt.getTime() - call.startedAt.getTime()) / 1000))
        : 0;

      await CallLog.create({
        caller: call.callerId,
        callee: call.calleeId,
        conversationId: call.conversationId,
        callType: call.callType,
        status,
        startedAt: call.startedAt || call.invitedAt,
        endedAt,
        durationInSeconds,
      });

      const conversation = await Conversation.findById(call.conversationId);
      if (!conversation) return; // conversation bị xoá giữa chừng, bỏ qua

      const message = await Message.create({
        conversationId: call.conversationId,
        senderId: call.callerId, // người bấm gọi luôn là "sender" của log này
        content: buildCallPreviewText(call.callType, status, durationInSeconds),
        type: "call",
        callInfo: {
          callId: call.callId,
          callType: call.callType,
          status,
          callerId: call.callerId,
          calleeId: call.calleeId,
          durationInSeconds,
        },
      });

      updateConversationAfterCreateMessage(conversation, message, call.callerId);
      await conversation.save();

      emitNewMessage(io, conversation, message);
    } catch (err) {
      console.error("Lỗi khi lưu CallLog / tạo call message:", err.message);
    }
  }

  // ---- 1. NGƯỜI GỌI mời cuộc gọi ----
  socket.on("call:invite", async ({ toUserId, conversationId, callType = "audio", fromUser }) => {
    // 🔒 Nếu 2 người đang chặn nhau: báo y hệt trường hợp "người nhận
    // không online" -> người gọi không biết mình đang bị chặn.
    if (await isBlockedBetween(currentUserId, toUserId)) {
      socket.emit("call:unavailable", { toUserId });
      return;
    }

    const targetSocketId = userSocketMap.get(toUserId);

    if (!targetSocketId) {
      // Người nhận không online -> báo ngay cho người gọi, không cần đổ chuông
      socket.emit("call:unavailable", { toUserId });
      return;
    }

    const callId = makeCallId(currentUserId, toUserId);

    // Nếu đã có cuộc gọi đang active giữa 2 người này thì chặn gọi trùng
    if (activeCalls.has(callId)) {
      socket.emit("call:busy", { toUserId });
      return;
    }

    activeCalls.set(callId, {
      callId,
      callerId: currentUserId,
      calleeId: toUserId,
      conversationId,
      callType,
      startedAt: null, // chỉ set khi callee thực sự accept
      invitedAt: new Date(),
    });

    io.to(targetSocketId).emit("call:incoming", {
      callId,
      fromUser, // { _id, fullName, avatarUrl } - gửi kèm từ client để hiển thị popup
      callType,
      conversationId,
    });

    socket.emit("call:ringing", { callId, toUserId });
  });

  // ---- 2. NGƯỜI NHẬN đồng ý ----
  socket.on("call:accept", ({ callId }) => {
    const call = activeCalls.get(callId);
    if (!call) return;

    call.startedAt = new Date();

    const callerSocketId = userSocketMap.get(call.callerId);
    if (callerSocketId) {
      io.to(callerSocketId).emit("call:accepted", { callId });
    }
  });

  // ---- 3. NGƯỜI NHẬN từ chối / đang bận ----
  socket.on("call:reject", async ({ callId, reason = "rejected" }) => {
    const call = activeCalls.get(callId);
    if (!call) return;

    const callerSocketId = userSocketMap.get(call.callerId);
    if (callerSocketId) {
      io.to(callerSocketId).emit("call:rejected", { callId, reason });
    }

    await finalizeCall(call, "rejected");
    activeCalls.delete(callId);
  });

  // ---- 4. Trao đổi SDP offer/answer (WebRTC) ----
  socket.on("call:offer", ({ callId, toUserId, sdp }) => {
    const targetSocketId = userSocketMap.get(toUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call:offer", { callId, sdp, fromUserId: currentUserId });
    }
  });

  socket.on("call:answer", ({ callId, toUserId, sdp }) => {
    const targetSocketId = userSocketMap.get(toUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call:answer", { callId, sdp });
    }
  });

  // ---- 5. Trao đổi ICE candidate ----
  socket.on("call:ice-candidate", ({ callId, toUserId, candidate }) => {
    const targetSocketId = userSocketMap.get(toUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call:ice-candidate", { callId, candidate });
    }
  });

  // ---- 6. Một trong hai bên cúp máy ----
  socket.on("call:end", async ({ callId }) => {
    const call = activeCalls.get(callId);
    if (!call) return;

    const otherUserId = call.callerId === currentUserId ? call.calleeId : call.callerId;
    const otherSocketId = userSocketMap.get(otherUserId);
    if (otherSocketId) {
      io.to(otherSocketId).emit("call:ended", { callId });
    }

    const status = call.startedAt ? "completed" : "cancelled";
    await finalizeCall(call, status);
    activeCalls.delete(callId);
  });

  // ---- 7. Người gọi tự huỷ trước khi được nhấc máy (không ai bắt máy / huỷ giữa chừng) ----
  socket.on("call:cancel", async ({ callId }) => {
    const call = activeCalls.get(callId);
    if (!call) return;

    const calleeSocketId = userSocketMap.get(call.calleeId);
    if (calleeSocketId) {
      io.to(calleeSocketId).emit("call:cancelled", { callId });
    }

    await finalizeCall(call, "missed");
    activeCalls.delete(callId);
  });

  // ---- 8. Nếu user rớt mạng/disconnect giữa cuộc gọi -> tự động kết thúc cuộc gọi liên quan ----
  socket.on("disconnect", async () => {
    for (const [callId, call] of activeCalls.entries()) {
      if (call.callerId === currentUserId || call.calleeId === currentUserId) {
        const otherUserId = call.callerId === currentUserId ? call.calleeId : call.callerId;
        const otherSocketId = userSocketMap.get(otherUserId);
        if (otherSocketId) {
          io.to(otherSocketId).emit("call:ended", { callId, reason: "peer_disconnected" });
        }
        const status = call.startedAt ? "completed" : "missed";
        await finalizeCall(call, status);
        activeCalls.delete(callId);
      }
    }
  });
}

/*
==================== HƯỚNG DẪN TÍCH HỢP ====================

Trong file `src/socket/index.js` hiện tại của bạn (nơi bạn đang có
sẵn map userId -> socketId để track online status), thêm:

  import { registerCallHandlers } from "./callSocketHandlers.js";

  io.on("connection", (socket) => {
    // ... code hiện tại của bạn (join room, online status, message, v.v.) ...

    registerCallHandlers(io, socket, userSocketMap);
  });

LƯU Ý: emitNewMessage() bắn message tới room `conversation._id.toString()`,
KHÔNG phải map userId -> socketId. Nghĩa là socket của user PHẢI đã
`socket.join(conversationId)` từ trước (chắc chắn code hiện tại của bạn
đã làm việc này ở đâu đó cho luồng tin nhắn thường). Nếu không join room,
log cuộc gọi sẽ được lưu vào DB nhưng KHÔNG hiện realtime - phải load lại
trang mới thấy.
================================================================
*/