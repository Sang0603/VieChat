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

io.on("connection", async (socket) => {
  const user = socket.user;

  onlineUsers.set(user._id.toString(), socket.id);

  io.emit("online-users", Array.from(onlineUsers.keys()));

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
    io.emit("online-users", Array.from(onlineUsers.keys()));
  });
});

// 👇 MỚI THÊM: helper cho adminController lấy số user đang online
// (dùng chung onlineUsers Map đang track ở trên, không cần DB field riêng)
export function getOnlineUserCount() {
  return onlineUsers.size;
}

export { io, app, server };