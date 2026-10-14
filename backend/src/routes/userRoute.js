import express from "express";
import {
  authMe,
  searchUserByUsername,
  uploadAvatar,
  changePassword,
  updateProfile,
  updatePrivacy,
  getBanks,
  getBankInfo,
  updateBankInfo,
  deleteBankInfo,
} from "../controllers/userController.js";
import { upload } from "../middlewares/uploadMiddleware.js";

const router = express.Router();

router.get("/me", authMe);
router.get("/search", searchUserByUsername);
router.post("/uploadAvatar", upload.single("file"), uploadAvatar);
router.post("/changePassword", changePassword);
router.patch("/updateProfile", updateProfile);
router.patch("/privacy", updatePrivacy);
// 👇 MỚI THÊM: tài khoản nhận tiền
router.get("/banks", getBanks);
router.get("/bank-info", getBankInfo);
router.patch("/bank-info", updateBankInfo);
router.delete("/bank-info", deleteBankInfo);

export default router;