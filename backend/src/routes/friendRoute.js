import express from "express";

import {
  acceptFriendRequest,
  sendFriendRequest,
  declineFriendRequest,
  getAllFriends,
  getFriendRequests,
  getFriendProfile,
  blockFriend,
  unfriendUser,
  getBlockedUsers,
  unblockUser,
  getBlockStatus,
} from "../controllers/friendController.js";

const router = express.Router();

router.post("/requests", sendFriendRequest);

router.post("/requests/:requestId/accept", acceptFriendRequest);
router.post("/requests/:requestId/decline", declineFriendRequest);

router.get("/blocked", getBlockedUsers);
router.delete("/blocked/:userId", unblockUser);

router.get("/", getAllFriends);
router.get("/requests", getFriendRequests);
router.get("/:friendId/profile", getFriendProfile);
router.get("/:friendId/block-status", getBlockStatus);

router.post("/:friendId/block", blockFriend);
router.delete("/:friendId", unfriendUser);

export default router;