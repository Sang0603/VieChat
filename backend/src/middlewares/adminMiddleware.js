// backend/src/middlewares/adminMiddleware.js
// req.user đã được gán bởi protectedRoute (authMiddleware.js) trước đó
export const adminMiddleware = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Chưa đăng nhập" });
  }
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Không có quyền truy cập" });
  }
  next();
};