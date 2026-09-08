import express from "express";
import {
  refreshToken,
  signIn,
  signOut,
  signUp,
  googleSignIn,
} from "../controllers/authController.js";
import {
  authLimiter,
  signInLimiter,
  refreshLimiter,
} from "../middlewares/rateLimitMiddleware.js";

const router = express.Router();

router.post("/signup", authLimiter, signUp);

router.post("/signin", signInLimiter, signIn);

router.post("/signout", signOut);

router.post("/refresh", refreshLimiter, refreshToken);

// 👇 MỚI THÊM: đăng nhập/đăng ký bằng Google
router.post("/google", signInLimiter, googleSignIn);

export default router;