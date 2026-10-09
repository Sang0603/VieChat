// @ts-nocheck
import bcrypt from "bcrypt";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import Session from "../models/Session.js";

const ACCESS_TOKEN_TTL = "30m"; // thuờng là dưới 15m
const REFRESH_TOKEN_TTL = 14 * 24 * 60 * 60 * 1000; // 14 ngày

// 🔧 SỬA: quy tắc cho tài khoản MỚI (giống hệt frontend)
// - chỉ gồm chữ không dấu (a-z), số, dấu chấm, gạch dưới
// - dài 3 đến 30 ký tự
// Giá trị tài khoản vẫn được lưu vào trường `email` trong DB để không phải
// đổi model/index, nên body request vẫn gửi dưới tên `email`.
// Chỉ áp dụng khi ĐĂNG KÝ; đăng nhập không kiểm tra định dạng nên các tài
// khoản cũ (vd abc@gmail.com, 123456) vẫn đăng nhập bình thường.
const ACCOUNT_MIN_LENGTH = 3;
const ACCOUNT_MAX_LENGTH = 30;
const ACCOUNT_CHARS_REGEX = /^[a-z0-9._]*$/;

// 🔧 MỚI: đánh giá độ mạnh mật khẩu (giống hệt frontend signup-form.tsx)
// - dưới 8 ký tự                  => "weak"
// - thiếu 3 trong 5 tiêu chí      => "weak"
// - thiếu 1-2 tiêu chí            => "medium"
// - đủ 5 tiêu chí                 => "strong"
// Chỉ áp dụng khi ĐĂNG KÝ. Đăng nhập không kiểm tra nên tài khoản cũ có
// mật khẩu yếu vẫn đăng nhập được.
const getPasswordStrength = (password) => {
  const checks = [
    password.length >= 8,
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ];

  const missing = checks.filter((passed) => !passed).length;

  if (password.length < 8) return "weak";
  if (missing === 0) return "strong";
  if (missing <= 2) return "medium";
  return "weak";
};

export const signUp = async (req, res) => {
  try {
    const { password, email, firstName, lastName } = req.body;

    if (!password || !email || !firstName || !lastName) {
      return res.status(400).json({
        message: "Không thể thiếu tài khoản, mật khẩu, họ và tên",
      });
    }

    // kiểm tra kiểu dữ liệu đầu vào (tránh crash khi client gửi object/array thay vì string)
    if (
      typeof password !== "string" ||
      typeof email !== "string" ||
      typeof firstName !== "string" ||
      typeof lastName !== "string"
    ) {
      return res.status(400).json({ message: "Dữ liệu đầu vào không hợp lệ" });
    }

    // tài khoản: cắt khoảng trắng, không phân biệt hoa thường
    const cleanAccount = email.toLowerCase().trim();
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();

    if (!cleanFirstName || !cleanLastName) {
      return res.status(400).json({ message: "Họ và tên không được để trống" });
    }

    if (!ACCOUNT_CHARS_REGEX.test(cleanAccount)) {
      return res.status(400).json({
        message: "Tài khoản chỉ gồm chữ không dấu, số, dấu chấm và gạch dưới",
      });
    }

    if (
      cleanAccount.length < ACCOUNT_MIN_LENGTH ||
      cleanAccount.length > ACCOUNT_MAX_LENGTH
    ) {
      return res.status(400).json({
        message: `Tài khoản phải từ ${ACCOUNT_MIN_LENGTH} đến ${ACCOUNT_MAX_LENGTH} ký tự`,
      });
    }

    // 🔧 SỬA: mật khẩu mức YẾU thì không cho đăng ký,
    // mức TRUNG BÌNH hoặc MẠNH thì được.
    if (getPasswordStrength(password) === "weak") {
      return res.status(400).json({
        message:
          "Mật khẩu quá yếu. Cần ít nhất 8 ký tự và kết hợp chữ hoa, chữ thường, số hoặc ký tự đặc biệt",
      });
    }

    // kiểm tra tài khoản tồn tại chưa
    const duplicateAccount = await User.findOne({ email: cleanAccount });

    if (duplicateAccount) {
      return res.status(409).json({ message: "Tài khoản đã được sử dụng" });
    }

    // mã hoá password
    const hashedPassword = await bcrypt.hash(password, 10); // salt = 10

    // username không do người dùng nhập -> tự sinh từ tài khoản
    const username = await generateUniqueUsername(cleanAccount);

    // tạo user mới (tên hiển thị = Họ + Tên)
    await User.create({
      username,
      hashedPassword,
      email: cleanAccount,
      displayName: `${cleanLastName} ${cleanFirstName}`,
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
    // lấy inputs (tài khoản được gửi dưới tên `email`)
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Thiếu tài khoản hoặc mật khẩu." });
    }

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ message: "Dữ liệu đầu vào không hợp lệ" });
    }

    // lấy hashedPassword trong db để so với password input
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res
        .status(401)
        .json({ message: "Tài khoản hoặc mật khẩu không chính xác" });
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
        .json({ message: "Tài khoản hoặc mật khẩu không chính xác" });
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

// tạo username không trùng từ chuỗi gốc (phần trước @ của email, hoặc tài khoản)
// (dùng cho cả đăng ký thường lẫn đăng nhập Google)
const generateUniqueUsername = async (base) => {
  const cleanBase =
    base
      .split("@")[0]
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
      const username = await generateUniqueUsername(email);
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
      // user đã tồn tại (đăng ký bằng tài khoản/password trước đó) -> gắn thêm googleId
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