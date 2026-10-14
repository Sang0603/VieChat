// Hàm tiền VND dùng chung cho các màn hình chia tiền.
// (Backend có bản tương ứng ở backend/src/utils/splitMoney.js - sửa thì sửa cả hai)

export const formatVnd = (amount: number) =>
  `${new Intl.NumberFormat("vi-VN").format(amount)}đ`;

// "450.000" -> 450000, chuỗi rỗng -> 0
export const parseAmount = (text: string) => {
  const digits = text.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
};

// Định dạng ô nhập tiền khi đang gõ: chỉ giữ chữ số (tối đa 10 chữ số)
// và thêm dấu chấm ngăn cách hàng nghìn.
export const formatAmountInput = (text: string) => {
  const digits = text.replace(/\D/g, "").slice(0, 10);
  return digits ? new Intl.NumberFormat("vi-VN").format(Number(digits)) : "";
};

// 100.000đ chia 3 người -> [33.334, 33.333, 33.333]
export const splitEqually = (amount: number, userIds: string[]) => {
  const base = Math.floor(amount / userIds.length);
  const remainder = amount - base * userIds.length;
  return userIds.map((userId, i) => ({
    userId,
    share: base + (i < remainder ? 1 : 0),
  }));
};

export const removeAccents = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");

interface VietQrParams {
  bankId: string; // mã BIN ngân hàng
  accountNo: string;
  amount: number;
  note: string; // nội dung chuyển khoản
  accountName: string;
}

// Link tạo mã VietQR nhanh (Quick Link) của VietQR, template "compact".
// Nội dung chuyển khoản được bỏ dấu và ký tự đặc biệt vì một số ngân hàng
// không nhận tiếng Việt có dấu.
export const buildVietQrUrl = ({
  bankId,
  accountNo,
  amount,
  note,
  accountName,
}: VietQrParams) => {
  const query: string[] = [];

  if (amount > 0) query.push(`amount=${Math.round(amount)}`);

  const cleanNote = removeAccents(note)
    .replace(/[^A-Za-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50);
  if (cleanNote) query.push(`addInfo=${encodeURIComponent(cleanNote)}`);

  const cleanName = removeAccents(accountName).toUpperCase().trim();
  if (cleanName) query.push(`accountName=${encodeURIComponent(cleanName)}`);

  const base = `https://img.vietqr.io/image/${encodeURIComponent(bankId)}-${encodeURIComponent(accountNo)}-compact.png`;
  return query.length ? `${base}?${query.join("&")}` : base;
};