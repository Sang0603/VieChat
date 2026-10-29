import bcrypt from "bcryptjs"; // nếu project dùng "bcrypt" thay vì "bcryptjs", đổi lại dòng này
import { uploadImageFromBuffer } from "../middlewares/uploadMiddleware.js";
import User from "../models/User.js";
import { getPasswordError } from "../utils/passwordRules.js";
import { getBankList } from "../utils/banks.js";

// 👇 MỚI THÊM: quy tắc cho tài khoản nhận tiền (VietQR)
// - mã ngân hàng là mã BIN 6 số
// - số tài khoản chỉ gồm chữ số, 6 đến 19 ký tự (VietQR cho tối đa 19 ký tự)
const BANK_ID_REGEX = /^\d{6}$/;
const BANK_ACCOUNT_REGEX = /^\d{6,19}$/;
const MAX_ACCOUNT_NAME_LENGTH = 50;

// 🆕 giới hạn cho hồ sơ cá nhân (bio khớp maxlength 500 trong model User)
const MAX_DISPLAY_NAME_LENGTH = 50;
const MAX_PHONE_LENGTH = 20;
const MAX_BIO_LENGTH = 500;
const ALLOWED_GENDERS = ["Nam", "Nữ", "Khác"];

// 🆕 Lỗi do dữ liệu người dùng gửi sai (validate/cast của Mongoose) -> trả 400
// thay vì 500 "Lỗi hệ thống".
const isClientDataError = (error) =>
  error?.name === "ValidationError" || error?.name === "CastError";

const toBankInfo = (bankInfo) =>
  bankInfo?.bankId
    ? {
        bankId: bankInfo.bankId,
        accountNo: bankInfo.accountNo ?? "",
        accountName: bankInfo.accountName ?? "",
      }
    : null;

export const authMe = async (req, res) => {
  try {
    const user = req.user; // lấy từ authMiddleware

    return res.status(200).json({
      user,
    });
  } catch (error) {
    console.error("Lỗi khi gọi authMe", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// 👇 MỚI THÊM: danh sách ngân hàng để người dùng chọn khi nhập tài khoản nhận tiền
export const getBanks = async (req, res) => {
  try {
    const { banks } = await getBankList();
    return res.status(200).json({ banks });
  } catch (error) {
    console.error("Lỗi xảy ra khi getBanks", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// 👇 MỚI THÊM: tài khoản nhận tiền của CHÍNH MÌNH.
// bankInfo trong model đặt select:false nên mọi API khác không bao giờ
// trả nó ra; chỉ ở đây mới chủ động lấy bằng select("+bankInfo").
export const getBankInfo = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("+bankInfo");
    return res.status(200).json({ bankInfo: toBankInfo(user?.bankInfo) });
  } catch (error) {
    console.error("Lỗi xảy ra khi getBankInfo", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// 👇 MỚI THÊM: lưu tài khoản nhận tiền
export const updateBankInfo = async (req, res) => {
  try {
    const { bankId, accountNo, accountName } = req.body;

    if (
      typeof bankId !== "string" ||
      typeof accountNo !== "string" ||
      typeof accountName !== "string"
    ) {
      return res.status(400).json({ message: "Dữ liệu đầu vào không hợp lệ" });
    }

    const cleanBankId = bankId.trim();
    const cleanAccountNo = accountNo.replace(/\s+/g, "");
    const cleanAccountName = accountName.trim().replace(/\s+/g, " ");

    if (!BANK_ID_REGEX.test(cleanBankId)) {
      return res.status(400).json({ message: "Vui lòng chọn ngân hàng" });
    }

    // chỉ kiểm tra "có trong danh sách" khi đã tải được danh sách thật từ VietQR
    const { banks, live } = await getBankList();
    if (live && !banks.some((b) => b.bin === cleanBankId)) {
      return res.status(400).json({ message: "Ngân hàng này chưa được hỗ trợ" });
    }

    if (!BANK_ACCOUNT_REGEX.test(cleanAccountNo)) {
      return res.status(400).json({
        message: "Số tài khoản chỉ gồm chữ số, từ 6 đến 19 ký tự",
      });
    }

    if (!cleanAccountName || cleanAccountName.length > MAX_ACCOUNT_NAME_LENGTH) {
      return res.status(400).json({
        message: `Tên chủ tài khoản phải từ 1 đến ${MAX_ACCOUNT_NAME_LENGTH} ký tự`,
      });
    }

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      {
        bankInfo: {
          bankId: cleanBankId,
          accountNo: cleanAccountNo,
          accountName: cleanAccountName,
        },
      },
      { new: true, runValidators: true }
    ).select("+bankInfo");

    return res.status(200).json({ bankInfo: toBankInfo(updated?.bankInfo) });
  } catch (error) {
    console.error("Lỗi xảy ra khi updateBankInfo", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// 👇 MỚI THÊM: xóa tài khoản nhận tiền
export const deleteBankInfo = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { $unset: { bankInfo: 1 } });
    return res.status(200).json({ bankInfo: null });
  } catch (error) {
    console.error("Lỗi xảy ra khi deleteBankInfo", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// 👇 MỚI THÊM: bảng chữ tiếng Việt có dấu, dùng để tìm KHÔNG phân biệt dấu
// (gõ "sang" vẫn khớp "Sáng", gõ "d" khớp cả "đ")
const VIET_CHARS = {
  a: "aàáảãạăằắẳẵặâầấẩẫậ",
  e: "eèéẻẽẹêềếểễệ",
  i: "iìíỉĩị",
  o: "oòóỏõọôồốổỗộơờớởỡợ",
  u: "uùúủũụưừứửữự",
  y: "yỳýỷỹỵ",
  d: "dđ",
};

// 👇 MỚI THÊM: biến chuỗi người dùng gõ thành regex khớp từng phần,
// không phân biệt hoa/thường và dấu. Ký tự đặc biệt đều được escape.
const buildNameRegex = (input) => {
  const normalized = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // bỏ dấu
    .replace(/đ/gi, "d")
    .toLowerCase();

  const pattern = normalized
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) =>
      [...token]
        .map((ch) => {
          const variants = VIET_CHARS[ch];
          if (variants) return `[${variants}${variants.toUpperCase()}]`;
          return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        })
        .join("")
    )
    .join("\\s+");

  return new RegExp(pattern, "i");
};

// 🔧 SỬA: tìm người dùng theo TÊN HIỂN THỊ (displayName).
// - khớp một phần, không phân biệt hoa/thường và dấu
// - loại trừ chính mình, tối đa 10 kết quả
// - trả về `users` (danh sách) và `user` (người đầu tiên) để code cũ không vỡ
// - giữ tên hàm searchUserByUsername để userRoute.js không phải sửa
export const searchUserByUsername = async (req, res) => {
  try {
    const { name } = req.query;

    if (typeof name !== "string" || name.trim() === "") {
      return res
        .status(400)
        .json({ message: "Cần cung cấp tên hiển thị trong query." });
    }

    const keyword = name.trim().slice(0, 50);

    const users = await User.find({
      displayName: buildNameRegex(keyword),
      _id: { $ne: req.user._id },
    })
      .sort({ displayName: 1 })
      .limit(10)
      .select("_id displayName username avatarUrl");

    return res.status(200).json({ users, user: users[0] ?? null });
  } catch (error) {
    console.error("Lỗi xảy ra khi searchUserByUsername", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const uploadAvatar = async (req, res) => {
  try {
    const file = req.file;
    const userId = req.user._id;

    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const result = await uploadImageFromBuffer(file.buffer);

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        avatarUrl: result.secure_url,
        avatarId: result.public_id,
      },
      {
        new: true,
      }
    ).select("avatarUrl");

    if (!updatedUser.avatarUrl) {
      return res.status(400).json({ message: "Avatar trả về null" });
    }

    return res.status(200).json({ avatarUrl: updatedUser.avatarUrl });
  } catch (error) {
    console.error("Lỗi xảy ra khi upload avatar", error);
    return res.status(500).json({ message: "Upload failed" });
  }
};

export const changePassword = async (req, res) => {
  try {
    const userId = req.user._id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "Thiếu mật khẩu hiện tại hoặc mật khẩu mới" });
    }

    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      return res.status(400).json({ message: "Dữ liệu đầu vào không hợp lệ" });
    }

    const user = await User.findById(userId).select("+hashedPassword");
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    // 🔧 SỬA: tài khoản đăng nhập bằng Google không có mật khẩu -> trước đây
    // bcrypt.compare(…, undefined) ném lỗi và trả 500 "Lỗi hệ thống".
    if (!user.hashedPassword) {
      return res.status(400).json({
        message: "Tài khoản này đăng nhập bằng Google nên chưa có mật khẩu để đổi",
      });
    }

    // 🔧 SỬA: mật khẩu mới theo luật chung (8-64 ký tự, không quá phổ biến,
    // không trùng tài khoản) thay cho "tối thiểu 6 ký tự" trước đây
    const passwordError = getPasswordError(newPassword, user.email);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.hashedPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Mật khẩu hiện tại không đúng" });
    }

    const salt = await bcrypt.genSalt(10);
    user.hashedPassword = await bcrypt.hash(newPassword, salt);
    await user.save();

    return res.status(200).json({ message: "Đổi mật khẩu thành công" });
  } catch (error) {
    console.error("Lỗi xảy ra khi changePassword", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { displayName, phone, bio, gender, dateOfBirth } = req.body;

    const updateData = {};

    // 🔧 SỬA: kiểm tra đầu vào trước khi ghi DB -> trả 400 thay vì 500
    if (displayName !== undefined) {
      if (typeof displayName !== "string") {
        return res.status(400).json({ message: "Tên hiển thị không hợp lệ" });
      }
      const cleanName = displayName.trim().replace(/\s+/g, " ");
      if (!cleanName || cleanName.length > MAX_DISPLAY_NAME_LENGTH) {
        return res.status(400).json({
          message: `Tên hiển thị phải từ 1 đến ${MAX_DISPLAY_NAME_LENGTH} ký tự`,
        });
      }
      updateData.displayName = cleanName;
    }

    if (phone !== undefined) {
      if (typeof phone !== "string" || phone.trim().length > MAX_PHONE_LENGTH) {
        return res.status(400).json({ message: "Số điện thoại không hợp lệ" });
      }
      updateData.phone = phone.trim();
    }

    if (bio !== undefined) {
      if (typeof bio !== "string" || bio.length > MAX_BIO_LENGTH) {
        return res.status(400).json({
          message: `Giới thiệu không được quá ${MAX_BIO_LENGTH} ký tự`,
        });
      }
      updateData.bio = bio;
    }

    if (gender !== undefined) {
      // cho phép bỏ trống ("" hoặc null) để xóa giới tính
      if (gender === "" || gender === null) {
        updateData.gender = null;
      } else if (ALLOWED_GENDERS.includes(gender)) {
        updateData.gender = gender;
      } else {
        return res.status(400).json({ message: "Giới tính không hợp lệ" });
      }
    }

    if (dateOfBirth !== undefined) {
      // dateOfBirth từ frontend gửi dạng "yyyy-mm-dd" (input type="date")
      if (!dateOfBirth) {
        updateData.dateOfBirth = null;
      } else {
        const parsed = new Date(dateOfBirth);
        if (Number.isNaN(parsed.getTime())) {
          return res.status(400).json({ message: "Ngày sinh không hợp lệ" });
        }
        updateData.dateOfBirth = parsed;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: "Không có dữ liệu để cập nhật" });
    }

    // 🔧 SỬA: loại hashedPassword khỏi dữ liệu trả về client
    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    }).select("-hashedPassword");

    if (!updatedUser) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    return res.status(200).json({ user: updatedUser });
  } catch (error) {
    if (isClientDataError(error)) {
      return res.status(400).json({ message: "Dữ liệu đầu vào không hợp lệ" });
    }
    console.error("Lỗi xảy ra khi updateProfile", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updatePrivacy = async (req, res) => {
  try {
    const userId = req.user._id;
    // 👇 MỚI THÊM: blockStrangerMessages
    const { showPhone, showDateOfBirth, blockStrangerMessages } = req.body;

    // 🆕 các cờ riêng tư phải là boolean
    const flags = { showPhone, showDateOfBirth, blockStrangerMessages };
    for (const [key, value] of Object.entries(flags)) {
      if (value !== undefined && typeof value !== "boolean") {
        return res.status(400).json({ message: `Giá trị ${key} không hợp lệ` });
      }
    }

    const updateData = {};
    if (showPhone !== undefined) updateData["privacy.showPhone"] = showPhone;
    if (showDateOfBirth !== undefined)
      updateData["privacy.showDateOfBirth"] = showDateOfBirth;
    if (blockStrangerMessages !== undefined)
      updateData["privacy.blockStrangerMessages"] = blockStrangerMessages;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: "Không có dữ liệu để cập nhật" });
    }

    // 🔧 SỬA: loại hashedPassword khỏi dữ liệu trả về client
    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    }).select("-hashedPassword");

    if (!updatedUser) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    return res.status(200).json({ user: updatedUser });
  } catch (error) {
    if (isClientDataError(error)) {
      return res.status(400).json({ message: "Dữ liệu đầu vào không hợp lệ" });
    }
    console.error("Lỗi xảy ra khi updatePrivacy", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};