import express from "express";
import {
  createConversation,
  getConversations,
  getMessages,
  markAsSeen,
  hideConversation,
  addGroupMembers,
  removeGroupMember, // 🆕
  deleteGroup, // 🆕
  leaveGroup, // 🆕 rời nhóm
} from "../controllers/conversationController.js";
import {
  getExpenses,
  createExpense,
  deleteExpense,
  getBalances,
  createSettlement,
  confirmSettlement,
  rejectSettlement,
  getPaymentInfo,
} from "../controllers/expenseController.js";
import { checkFriendship } from "../middlewares/friendMiddleware.js";

const router = express.Router();

router.post("/", checkFriendship, createConversation);
router.get("/", getConversations);
router.get("/:conversationId/messages", getMessages);
router.patch("/:conversationId/seen", markAsSeen);
// 🆕 MỚI THÊM: xóa (ẩn) đoạn chat phía user hiện tại
router.delete("/:conversationId", hideConversation);

// 🆕 MỚI THÊM: thêm thành viên vào nhóm chat.
// 🔧 Gắn checkFriendship: chỉ được thêm người là BẠN BÈ của mình (kiểm tra ở backend)
router.post("/:conversationId/members", checkFriendship, addGroupMembers);

// 🆕 MỚI THÊM: chủ nhóm kick thành viên / xóa hẳn nhóm
router.delete("/:conversationId/members/:memberId", removeGroupMember);
router.delete("/:conversationId/group", deleteGroup);

// 🆕 MỚI THÊM: thành viên tự rời nhóm
router.post("/:conversationId/leave", leaveGroup);

// 👇 MỚI THÊM: chi tiêu chung của nhóm (chia tiền + VietQR)
router.get("/:conversationId/expenses", getExpenses);
router.post("/:conversationId/expenses", createExpense);
router.delete("/:conversationId/expenses/:expenseId", deleteExpense);
router.get("/:conversationId/balances", getBalances);
router.post("/:conversationId/settlements", createSettlement);
router.patch("/:conversationId/settlements/:settlementId/confirm", confirmSettlement);
router.patch("/:conversationId/settlements/:settlementId/reject", rejectSettlement);
router.get("/:conversationId/payment-info/:userId", getPaymentInfo);

export default router;