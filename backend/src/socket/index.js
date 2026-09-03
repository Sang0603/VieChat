import { Server } from "socket.io";
import http from "http";
import express from "express";
import { socketAuthMiddleware } from "../middlewares/socketMiddleware.js";
import { getUserConversationsForSocketIO } from "../controllers/conversationController.js";
import { registerCallHandlers } from "./callSocketHandlers.js";

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    credentials: true,
  },
});

io.use(socketAuthMiddleware);

const onlineUsers = new Map(); // {userId: socketId}

// 👇 MỚI THÊM: theo dõi riêng những userId đang online là admin, để loại ra
// khỏi số đếm "người dùng online" trên dashboard (admin không phải end-user
// thật). Vẫn giữ nguyên onlineUsers Map như cũ (userId -> socketId) để không
// ảnh hưởng chỗ khác đang dùng nó (registerCallHandlers, broadcast list...).
const adminUserIds = new Set();

io.on("connection", async (socket) => {
  const user = socket.user;

  onlineUsers.set(user._id.toString(), socket.id);
  if (user.role === "admin") {
    adminUserIds.add(user._id.toString());
    // 👇 MỚI THÊM: admin join room riêng để nhận realtime số online,
    // không cần dashboard phải polling.
    socket.join("admins");
  }

  io.emit("online-users", Array.from(onlineUsers.keys()));
  broadcastOnlineCount();

  const conversationIds = await getUserConversationsForSocketIO(user._id);
  conversationIds.forEach((id) => {
    socket.join(id);
  });

  socket.on("join-conversation", (conversationId) => {
    socket.join(conversationId);
  });

  socket.join(user._id.toString());

  registerCallHandlers(io, socket, onlineUsers);

  // ==================== TYPING INDICATOR ====================
  socket.on("typing:start", ({ conversationId }) => {
    if (!conversationId) return;

    socket.to(conversationId).emit("typing:start", {
      conversationId,
      userId: user._id.toString(),
      displayName: user.displayName,
    });
  });

  socket.on("typing:stop", ({ conversationId }) => {
    if (!conversationId) return;

    socket.to(conversationId).emit("typing:stop", {
      conversationId,
      userId: user._id.toString(),
    });
  });
  // ==================== HẾT PHẦN TYPING INDICATOR ====================

  socket.on("disconnect", () => {
    onlineUsers.delete(user._id.toString());
    adminUserIds.delete(user._id.toString());
    io.emit("online-users", Array.from(onlineUsers.keys()));
    broadcastOnlineCount();
  });
});

// 👇 MỚI THÊM: helper cho adminController lấy số user đang online
// (dùng chung onlineUsers Map đang track ở trên, không cần DB field riêng)
// Loại admin ra khỏi số đếm — xem giải thích ở adminUserIds phía trên.
export function getOnlineUserCount() {
  let count = 0;
  for (const userId of onlineUsers.keys()) {
    if (!adminUserIds.has(userId)) count++;
  }
  return count;
}

// 👇 MỚI THÊM: đẩy realtime số online cho các admin đang mở dashboard, thay
// vì bắt frontend phải polling. Chỉ emit tới room "admins" (không broadcast
// toàn bộ) để tránh lộ số liệu quản trị cho user thường.
function broadcastOnlineCount() {
  io.to("admins").emit("online-count", getOnlineUserCount());
}

export { io, app, server };