// backend/src/routes/adminRoute.js
import express from "express";
import { adminMiddleware } from "../middlewares/adminMiddleware.js";
import {
  getOverviewStats,
  getRegistrationsByDay,
  getMessagesByDay,
  getOnlineSnapshot,
  getActivityStats,
} from "../controllers/adminController.js";

const router = express.Router();

// protectedRoute (xác thực đăng nhập) đã được app.use() toàn cục trước route này trong server.js
// ở đây chỉ cần check thêm quyền admin
router.use(adminMiddleware);

router.get("/stats", getOverviewStats);
router.get("/stats/registrations", getRegistrationsByDay);
router.get("/stats/messages", getMessagesByDay);
router.get("/stats/online", getOnlineSnapshot);
router.get("/stats/activity", getActivityStats);

export default router;