// @ts-nocheck
import bcrypt from "bcrypt";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import Session from "../models/Session.js";

const ACCESS_TOKEN_TTL = "30m"; // thuờng là dưới 15m
const REFRESH_TOKEN_TTL = 14 * 24 * 60 * 60 * 1000; // 14 ngày

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const signUp = async (req, res) => {
  try {
    const { username, password, email, firstName, lastName } = req.body;

    if (!username || !password || !email || !firstName || !lastName) {
      return res.status(400).json({
        message: "Không thể thiếu username, password, email, firstName, và lastName",
      });
    }

    // kiểm tra kiểu dữ liệu đầu vào (tránh crash khi client gửi object/array thay vì string)
    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      typeof email !== "string" ||
      typeof firstName !== "string" ||
      typeof lastName !== "string"
    ) {
      return res.status(400).json({ message: "Dữ liệu đầu vào không hợp lệ" });
    }

    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Email không hợp lệ" });
    }

    // kiểm tra mật khẩu mạnh (bắt buộc, tránh bị bypass qua API trực tiếp)
    const strongPasswordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;
    if (!strongPasswordRegex.test(password)) {
      return res.status(400).json({
        message:
          "Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.",
      });
    }

    // kiểm tra username tồn tại chưa
    const duplicate = await User.findOne({ username: username.toLowerCase().trim() });

    if (duplicate) {
      return res.status(409).json({ message: "username đã tồn tại" });
    }

    // kiểm tra email tồn tại chưa
    const duplicateEmail = await User.findOne({ email: email.toLowerCase().trim() });

    if (duplicateEmail) {
      return res.status(409).json({ message: "email đã được sử dụng" });
    }

    // mã hoá password
    const hashedPassword = await bcrypt.hash(password, 10); // salt = 10

    // tạo user mới
    await User.create({
      username,
      hashedPassword,
      email,
      displayName: `${lastName} ${firstName}`,
      authProvider: "local",
    });

    // return
    return res.sendStatus(204);
  } catch (error) {
    console.error("Lỗi khi gọi signUp", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const signIn = async (req, res) => {
  try {
    // lấy inputs
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Thiếu username hoặc password." });
    }

    if (typeof username !== "string" || typeof password !== "string") {
      return res.status(400).json({ message: "Dữ liệu đầu vào không hợp lệ" });
    }

    // lấy hashedPassword trong db để so với password input
    const user = await User.findOne({ username: username.toLowerCase().trim() });

    if (!user) {
      return res
        .status(401)
        .json({ message: "username hoặc password không chính xác" });
    }

    // tài khoản tạo bằng Google có thể chưa có password
    if (!user.hashedPassword) {
      return res.status(401).json({
        message:
          "Tài khoản này được đăng nhập bằng Google. Vui lòng dùng đúng phương thức đó.",
      });
    }

    // kiểm tra password
    const passwordCorrect = await bcrypt.compare(password, user.hashedPassword);

    if (!passwordCorrect) {
      return res
        .status(401)
        .json({ message: "username hoặc password không chính xác" });
    }

    // nếu khớp, tạo accessToken với JWT
    const accessToken = jwt.sign(
      { userId: user._id },
      // @ts-ignore
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: ACCESS_TOKEN_TTL }
    );

    // tạo refresh token
    const refreshToken = crypto.randomBytes(64).toString("hex");

    // tạo session mới để lưu refresh token
    await Session.create({
      userId: user._id,
      refreshToken,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL),
    });

    // trả refresh token về trong cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none", //backend, frontend deploy riêng
      maxAge: REFRESH_TOKEN_TTL,
    });

    // trả access token về trong res
    return res
      .status(200)
      .json({ message: `User ${user.displayName} đã logged in!`, accessToken });
  } catch (error) {
    console.error("Lỗi khi gọi signIn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const signOut = async (req, res) => {
  try {
    // lấy refresh token từ cookie
    const token = req.cookies?.refreshToken;

    if (token) {
      // xoá refresh token trong Session
      await Session.deleteOne({ refreshToken: token });

      // xoá cookie
      res.clearCookie("refreshToken");
    }

    return res.sendStatus(204);
  } catch (error) {
    console.error("Lỗi khi gọi signOut", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// tạo access token mới từ refresh token
export const refreshToken = async (req, res) => {
  try {
    // lấy refresh token từ cookie
    const token = req.cookies?.refreshToken;
    if (!token) {
      return res.status(401).json({ message: "Token không tồn tại." });
    }

    // so với refresh token trong db
    const session = await Session.findOne({ refreshToken: token });

    if (!session) {
      return res.status(403).json({ message: "Token không hợp lệ hoặc đã hết hạn" });
    }

    // kiểm tra hết hạn chưa
    if (session.expiresAt < new Date()) {
      return res.status(403).json({ message: "Token đã hết hạn." });
    }

    // tạo access token mới
    const accessToken = jwt.sign(
      {
        userId: session.userId,
      },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: ACCESS_TOKEN_TTL }
    );

    // return
    return res.status(200).json({ accessToken });
  } catch (error) {
    console.error("Lỗi khi gọi refreshToken", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// ================== GOOGLE LOGIN ==================

// tạo username không trùng từ phần trước @ của email
const generateUniqueUsername = async (base) => {
  const cleanBase =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 20) || "user";

  let candidate = cleanBase;
  let suffix = 0;

  // eslint-disable-next-line no-await-in-loop
  while (await User.findOne({ username: candidate })) {
    suffix += 1;
    candidate = `${cleanBase}${suffix}`;
  }

  return candidate;
};

// 🔧 FIX: trước đây nhận `credential` (ID token JWT) từ nút <GoogleLogin>
// (nút iframe do Google vẽ) và xác thực bằng googleClient.verifyIdToken()
// (thư viện google-auth-library). Nút đó tự đổi text/avatar thành "Tiếp
// tục bằng tên ..." khi trình duyệt có sẵn phiên Google -> không kiểm
// soát được (xem SocialAuthButtons.tsx).
//
// Giờ frontend dùng nút tự vẽ 100% + hook useGoogleLogin flow "implicit",
// nên chỉ nhận được access_token, không có ID token nữa. Xác thực bằng
// cách gọi thẳng Google userinfo endpoint bằng access_token, lấy về các
// field cần: sub, email, name, given_name, family_name, picture.
// -> Không còn cần OAuth2Client/google-auth-library trong file này nữa.
export const googleSignIn = async (req, res) => {
  try {
    const { googleAccessToken } = req.body;

    if (!googleAccessToken || typeof googleAccessToken !== "string") {
      return res.status(400).json({ message: "Thiếu Google access token" });
    }

    let payload;
    try {
      const userinfoRes = await fetch(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        { headers: { Authorization: `Bearer ${googleAccessToken}` } }
      );

      if (!userinfoRes.ok) {
        throw new Error(`Google userinfo trả về status ${userinfoRes.status}`);
      }

      payload = await userinfoRes.json();
    } catch (error) {
      console.error("Google access token không hợp lệ", error);
      return res.status(401).json({ message: "Google access token không hợp lệ" });
    }

    if (!payload?.email) {
      return res.status(401).json({ message: "Không lấy được email từ Google" });
    }

    const email = payload.email.toLowerCase().trim();

    let user = await User.findOne({ $or: [{ googleId: payload.sub }, { email }] });

    if (!user) {
      const username = await generateUniqueUsername(email.split("@")[0]);
      user = await User.create({
        username,
        email,
        googleId: payload.sub,
        displayName:
          payload.name ||
          `${payload.given_name ?? ""} ${payload.family_name ?? ""}`.trim() ||
          username,
        avatarUrl: payload.picture,
        authProvider: "google",
      });
    } else if (!user.googleId) {
      // user đã tồn tại (đăng ký bằng username/password trước đó) -> gắn thêm googleId
      user.googleId = payload.sub;
      if (!user.avatarUrl) user.avatarUrl = payload.picture;
      await user.save();
    }

    // tạo accessToken + refreshToken (session) giống signIn thường
    const accessToken = jwt.sign(
      { userId: user._id },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: ACCESS_TOKEN_TTL }
    );

    const refreshToken = crypto.randomBytes(64).toString("hex");

    await Session.create({
      userId: user._id,
      refreshToken,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL),
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: REFRESH_TOKEN_TTL,
    });

    return res.status(200).json({
      message: `User ${user.displayName} đã logged in!`,
      accessToken,
    });
  } catch (error) {
    console.error("Lỗi khi gọi googleSignIn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};