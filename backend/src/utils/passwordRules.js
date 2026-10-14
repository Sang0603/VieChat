// Luật mật khẩu dùng chung cho đăng ký và đổi mật khẩu.
// (Frontend có bản tương ứng ở frontend/src/lib/passwordRules.ts - sửa thì sửa cả hai)

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;

// bcrypt chỉ đọc 72 byte đầu của mật khẩu nên phải chặn dài hơn mức đó
const PASSWORD_MAX_BYTES = 72;

// danh sách nhỏ các mật khẩu quá phổ biến (chỉ ghi loại từ 8 ký tự trở lên,
// vì ngắn hơn đã bị chặn bởi độ dài tối thiểu)
const COMMON_PASSWORDS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "12341234",
  "123123123",
  "987654321",
  "147258369",
  "123456789a",
  "a123456789",
  "11111111",
  "00000000",
  "password",
  "password1",
  "password12",
  "password123",
  "passw0rd",
  "qwertyui",
  "qwertyuiop",
  "qwerty123",
  "qwerty12",
  "1q2w3e4r",
  "1qaz2wsx",
  "abc12345",
  "abcd1234",
  "abcdefgh",
  "iloveyou",
  "admin123",
  "administrator",
  "letmein1",
  "welcome1",
  "welcome123",
  "monkey123",
  "dragon123",
  "football",
  "baseball",
  "sunshine",
  "princess",
  "superman",
  "trustno1",
  "whatever",
  "internet",
  "computer",
  "vietnam123",
  "matkhau123",
  "matkhau1",
  "viechat123",
  "viechat1",
]);

// Trả về thông báo lỗi tiếng Việt, hoặc null nếu mật khẩu hợp lệ.
// `account` (không bắt buộc): dùng để chặn mật khẩu trùng với tài khoản.
export const getPasswordError = (password, account = "") => {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự`;
  }

  if (
    password.length > PASSWORD_MAX_LENGTH ||
    Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES
  ) {
    return `Mật khẩu tối đa ${PASSWORD_MAX_LENGTH} ký tự`;
  }

  const lower = password.toLowerCase();

  if (COMMON_PASSWORDS.has(lower) || /^(.)\1+$/u.test(password)) {
    return "Mật khẩu này quá phổ biến, hãy chọn mật khẩu khác";
  }

  if (account && lower === String(account).toLowerCase().trim()) {
    return "Mật khẩu không được trùng với tài khoản";
  }

  return null;
};