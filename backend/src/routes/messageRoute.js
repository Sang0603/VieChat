import express from "express";

import {
  sendDirectMessage,
  sendGroupMessage,
  toggleReaction, // 👈 mới thêm
  uploadChatImage,
} from "../controllers/messageController.js";
import {
  checkFriendship,
  checkGroupMembership,
} from "../middlewares/friendMiddleware.js";
import { uploadMessageImage } from "../middlewares/uploadMiddleware.js";

const router = express.Router();

router.post("/upload", uploadMessageImage.single("file"), uploadChatImage);
router.post("/direct", checkFriendship, sendDirectMessage);
router.post("/group", checkGroupMembership, sendGroupMessage);
// 👇 mới thêm: quyền truy cập đã được kiểm tra trực tiếp trong controller
// (dựa vào participants của conversation chứa messageId)
router.patch("/:messageId/reaction", toggleReaction);

export default router;