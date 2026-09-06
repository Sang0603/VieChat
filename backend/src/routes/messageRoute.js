import express from "express";

import {
  sendDirectMessage,
  sendGroupMessage,
  toggleReaction,
  uploadChatImage,
  uploadChatVideo, // 👈 MỚI THÊM
} from "../controllers/messageController.js";
import {
  checkFriendship,
  checkGroupMembership,
} from "../middlewares/friendMiddleware.js";
import {
  uploadMessageImage,
  uploadMessageVideo, // 👈 MỚI THÊM
} from "../middlewares/uploadMiddleware.js";

const router = express.Router();

router.post("/upload", uploadMessageImage.single("file"), uploadChatImage);
// 👇 MỚI THÊM: route upload video riêng, dùng multer diskStorage (xem uploadMiddleware.js)
router.post("/upload-video", uploadMessageVideo.single("file"), uploadChatVideo);
router.post("/direct", checkFriendship, sendDirectMessage);
router.post("/group", checkGroupMembership, sendGroupMessage);
router.patch("/:messageId/reaction", toggleReaction);

export default router;