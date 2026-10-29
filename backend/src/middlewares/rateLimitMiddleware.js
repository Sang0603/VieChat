import rateLimit from "express-rate-limit";

// Giới hạn 10 lần thử/15 phút cho mỗi IP — chỉ áp dụng cho signup
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Quá nhiều yêu cầu, vui lòng thử lại sau ít phút." },
  standardHeaders: true,
  legacyHeaders: false,
});

// 👇 MỚI THÊM: /auth/refresh là hành động NỀN, tự động, không phải hành vi
// người dùng chủ động gõ - xảy ra liên tục và hợp lệ khi mở nhiều tab/thiết
// bị cùng lúc, hoặc khi nhiều API cùng 403 gần như đồng thời. Dùng chung
// limiter 10/15 phút với signup (vốn để chống brute-force) khiến refresh
// hợp lệ bị chặn oan rồi tự động đăng xuất người dùng. Nới hẳn riêng cho route
// này, chỉ để chặn spam/tấn công thật sự (vd script tự động gọi liên tục).
export const refreshLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  message: { message: "Quá nhiều yêu cầu làm mới phiên đăng nhập, vui lòng thử lại sau ít phút." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // chỉ đếm các lần refresh THẤT BẠI (token không hợp lệ) - refresh thành công không tính vào quota
});

// key theo IP + tài khoản -> chỉ chặn riêng tài khoản đang bị brute-force,
// không ảnh hưởng tài khoản khác đăng nhập từ cùng IP (mạng công ty, NAT,...)
// 🔧 SỬA: form đăng nhập gửi trường "email" (không phải "username") nên trước
// đây key luôn là "<ip>:unknown" -> mọi tài khoản cùng IP dùng chung bộ đếm.
// Giờ ưu tiên "email", vẫn chấp nhận "username" để không vỡ client cũ.
const signInKeyGenerator = (req) => {
  const raw =
    typeof req.body?.email === "string"
      ? req.body.email
      : typeof req.body?.username === "string"
      ? req.body.username
      : "";
  const account = raw.toLowerCase().trim() || "unknown";
  return `${req.ip}:${account}`;
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