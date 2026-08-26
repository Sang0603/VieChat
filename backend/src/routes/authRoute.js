import express from "express";
import {
  refreshToken,
  signIn,
  signOut,
  signUp,
} from "../controllers/authController.js";
import { authLimiter, signInLimiter } from "../middlewares/rateLimitMiddleware.js";

const router = express.Router();

router.post("/signup", authLimiter, signUp);

router.post("/signin", signInLimiter, signIn);

router.post("/signout", signOut);

router.post("/refresh", authLimiter, refreshToken);

export default router;