import rateLimit from "express-rate-limit";

// Giới hạn 10 lần thử/15 phút cho mỗi IP — áp dụng cho login, register, refresh token
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Quá nhiều yêu cầu, vui lòng thử lại sau ít phút." },
  standardHeaders: true,
  legacyHeaders: false,
});