import { Server } from "socket.io";
import http from "http";
import express from "express";
import { socketAuthMiddleware } from "../middlewares/socketMiddleware.js";
import { getUserConversationsForSocketIO } from "../controllers/conversationController.js";
import { registerCallHandlers } from "./callSocketHandlers.js"; // 👈 mới thêm

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

  // console.log(`${user.displayName} online với socket ${socket.id}`);

  // 👇 ĐỔI: dùng .toString() để key luôn là string, khớp với cách
  // callSocketHandlers.js lookup userSocketMap.get(toUserId) bằng string
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

  // 👇 mới thêm: đăng ký toàn bộ event liên quan tới gọi thoại
  registerCallHandlers(io, socket, onlineUsers);

  // ==================== 👇 MỚI THÊM: TYPING INDICATOR ====================
  // Client gửi "typing:start" mỗi khi đang gõ (đã debounce ở phía client),
  // server chỉ relay lại cho những người KHÁC trong cùng conversation
  // (dùng socket.to(...) chứ không phải io.to(...) để tự loại trừ chính
  // người gửi). Không lưu DB vì đây là trạng thái tạm thời, không cần
  // persist qua reload trang.
  //
  // LƯU Ý: client PHẢI đã join room conversationId trước đó (đã tự động
  // xảy ra ở đoạn conversationIds.forEach ở trên, hoặc lúc emit
  // "join-conversation" khi tạo group/direct mới), nếu không thì
  // socket.to(conversationId) sẽ không có ai để gửi tới.
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
    // 👇 ĐỔI: .toString() cho khớp với dòng set ở trên
    onlineUsers.delete(user._id.toString());
    io.emit("online-users", Array.from(onlineUsers.keys()));
    /* console.log(`socket disconnected: ${socket.id}`); */
  });
});

export { io, app, server };