import express from "express";
import dotenv from "dotenv";
import { connectDB } from "./libs/db.js";
import authRoute from "./routes/authRoute.js";
import userRoute from "./routes/userRoute.js";
import friendRoute from "./routes/friendRoute.js";
import messageRoute from "./routes/messageRoute.js";
import conversationRoute from "./routes/conversationRoute.js";
import adminRoute from "./routes/adminRoute.js"; // 👈 mới thêm
import cookieParser from "cookie-parser";
import { protectedRoute } from "./middlewares/authMiddleware.js";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import fs from "fs";
import { app, server } from "./socket/index.js";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

// const app = express();
const PORT = process.env.PORT || 5001;

// middlewares
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));

// CLOUDINARY Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// swagger
const swaggerDocument = JSON.parse(fs.readFileSync("./src/swagger.json", "utf8"));

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// public routes
app.use("/api/auth", authRoute);

// private routes
app.use(protectedRoute);
app.use("/api/users", userRoute);
app.use("/api/friends", friendRoute);
app.use("/api/messages", messageRoute);
app.use("/api/conversations", conversationRoute);
app.use("/api/admin", adminRoute); // 👈 mới thêm — tự check thêm role admin bên trong

// 🆕 MỚI THÊM: middleware xử lý lỗi chung (phải đặt SAU tất cả route).
// Trước đây không có nên lỗi tải tệp của multer (quá dung lượng, sai định
// dạng video) rơi vào trang lỗi 500 mặc định của Express.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  // JSON gửi lên sai cú pháp
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Dữ liệu JSON không hợp lệ" });
  }

  // lỗi do multer (giới hạn dung lượng, trường tệp sai, ...)
  if (err?.name === "MulterError") {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "Tệp vượt quá dung lượng cho phép" });
    }
    return res.status(400).json({ message: "Tệp tải lên không hợp lệ" });
  }

  // lỗi do fileFilter của uploadMiddleware ném ra, vd "Định dạng video không được hỗ trợ"
  if (typeof err?.message === "string" && err.message.startsWith("Định dạng")) {
    return res.status(400).json({ message: err.message });
  }

  console.error("Lỗi chưa được xử lý:", err);
  return res.status(500).json({ message: "Lỗi hệ thống" });
});

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`server bắt đầu trên cổng ${PORT}`);
  });
});