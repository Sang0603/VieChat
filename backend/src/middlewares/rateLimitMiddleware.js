import rateLimit from "express-rate-limit";

// Giới hạn 10 lần thử/15 phút cho mỗi IP — áp dụng cho signup, refresh token
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Quá nhiều yêu cầu, vui lòng thử lại sau ít phút." },
  standardHeaders: true,
  legacyHeaders: false,
});

// key theo IP + username -> chỉ chặn riêng tài khoản đang bị brute-force,
// không ảnh hưởng tài khoản khác đăng nhập từ cùng IP (mạng công ty, NAT,...)
const signInKeyGenerator = (req) => {
  const username =
    typeof req.body?.username === "string"
      ? req.body.username.toLowerCase().trim()
      : "unknown";
  return `${req.ip}:${username}`;
};

// Tầng 1: sai quá 5 lần trong 5 phút -> khoá 5 phút
export const signInLimiterShort = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  keyGenerator: signInKeyGenerator,
  message: {
    message: "Bạn đã đăng nhập sai quá 5 lần. Vui lòng thử lại sau 5 phút.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // chỉ đếm các lần login thất bại
});

// Tầng 2: sai quá 10 lần trong 15 phút -> khoá 15 phút (đếm dồn, cửa sổ dài hơn)
export const signInLimiterLong = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: signInKeyGenerator,
  message: {
    message: "Bạn đã đăng nhập sai quá 10 lần. Vui lòng thử lại sau 15 phút.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// dùng chung cho route /signin: chạy tầng ngắn trước, tầng dài sau
export const signInLimiter = [signInLimiterShort, signInLimiterLong];