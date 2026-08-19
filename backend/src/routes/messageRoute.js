import express from "express";

import {
  sendDirectMessage,
  sendGroupMessage,
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

export default router;
