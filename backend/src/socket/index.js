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

const adminUserIds = new Set();

io.on("connection", async (socket) => {
  const user = socket.user;
  const userId = user._id.toString();

  onlineUsers.set(userId, socket.id);
  if (user.role === "admin") {
    adminUserIds.add(userId);
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

  socket.join(userId);

  registerCallHandlers(io, socket, onlineUsers);

  // ==================== TYPING INDICATOR ====================
  socket.on("typing:start", ({ conversationId }) => {
    if (!conversationId) return;

    socket.to(conversationId).emit("typing:start", {
      conversationId,
      userId,
      displayName: user.displayName,
    });
  });

  socket.on("typing:stop", ({ conversationId }) => {
    if (!conversationId) return;

    socket.to(conversationId).emit("typing:stop", {
      conversationId,
      userId,
    });
  });
  // ==================== HẾT PHẦN TYPING INDICATOR ====================

  socket.on("disconnect", () => {
    // 🔧 FIX: chỉ xoá entry nếu nó vẫn đang trỏ đúng socket này. Trong dev
    // mode (React StrictMode), effect kết nối socket ở frontend chạy theo
    // kiểu mount -> cleanup -> mount lại ngay khi load trang, tạo ra 1 socket
    // cũ bị disconnect ngay sau khi 1 socket mới của CÙNG user đã kết nối và
    // ghi đè map. Sự kiện "disconnect" của socket cũ đến sau, nếu xoá vô
    // điều kiện theo userId sẽ xoá NHẦM luôn entry của socket mới đang sống,
    // khiến các sự kiện call:accepted/call:offer... gửi sai đích hoặc bị mất.
    if (onlineUsers.get(userId) === socket.id) {
      onlineUsers.delete(userId);
      adminUserIds.delete(userId);
      io.emit("online-users", Array.from(onlineUsers.keys()));
      broadcastOnlineCount();
    }
  });
});

export function getOnlineUserCount() {
  let count = 0;
  for (const id of onlineUsers.keys()) {
    if (!adminUserIds.has(id)) count++;
  }
  return count;
}

function broadcastOnlineCount() {
  io.to("admins").emit("online-count", getOnlineUserCount());
}

export { io, app, server };