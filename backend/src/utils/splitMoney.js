// Hàm thuần để chia tiền và tính nợ trong nhóm.
// Tiền luôn là số nguyên VND, userId luôn là chuỗi.

export const MAX_EXPENSE_AMOUNT = 1_000_000_000; // 1 tỷ đồng

// 100.000đ chia 3 người -> [33.334, 33.333, 33.333]
export const splitEqually = (amount, userIds) => {
  const base = Math.floor(amount / userIds.length);
  const remainder = amount - base * userIds.length;
  return userIds.map((userId, i) => ({
    userId,
    share: base + (i < remainder ? 1 : 0),
  }));
};

// Kiểm tra danh sách "ai đã chi bao nhiêu": [{ userId, amount }].
// Trả về thông báo lỗi tiếng Việt, hoặc null nếu hợp lệ.
export const validatePayments = (payments) => {
  if (!Array.isArray(payments) || payments.length === 0) {
    return "Cần ít nhất một người đã chi tiền";
  }

  const seen = new Set();
  let total = 0;
  for (const p of payments) {
    if (!p || typeof p.userId !== "string" || !p.userId) {
      return "Dữ liệu người chi tiền không hợp lệ";
    }
    if (seen.has(p.userId)) return "Một người không thể xuất hiện hai lần";
    seen.add(p.userId);
    if (!Number.isInteger(p.amount) || p.amount < 1) {
      return "Số tiền mỗi người đã chi phải là số nguyên lớn hơn 0";
    }
    total += p.amount;
  }

  if (total > MAX_EXPENSE_AMOUNT) {
    return "Số tiền phải là số nguyên từ 1 đến 1.000.000.000";
  }
  return null;
};

// Trả về thông báo lỗi tiếng Việt, hoặc null nếu hợp lệ.
export const validateShares = (amount, participants) => {
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_EXPENSE_AMOUNT) {
    return "Số tiền phải là số nguyên từ 1 đến 1.000.000.000";
  }
  if (!Array.isArray(participants) || participants.length === 0) {
    return "Cần chọn ít nhất một người cùng chia";
  }

  const seen = new Set();
  let total = 0;
  for (const p of participants) {
    if (!p || typeof p.userId !== "string" || !p.userId) {
      return "Dữ liệu người tham gia không hợp lệ";
    }
    if (seen.has(p.userId)) return "Một người không thể xuất hiện hai lần";
    seen.add(p.userId);
    if (!Number.isInteger(p.share) || p.share < 1) {
      return "Phần của mỗi người phải là số nguyên lớn hơn 0";
    }
    total += p.share;
  }

  if (total !== amount) return "Tổng phần của mọi người phải bằng số tiền";
  return null;
};

// net[userId] > 0: được nhận lại, < 0: còn nợ.
// Chỉ khoản trả nợ đã được xác nhận (confirmed) mới làm đổi số dư.
export const computeBalances = (expenses, settlements = []) => {
  const net = {};
  const add = (id, value) => {
    net[id] = (net[id] ?? 0) + value;
  };

  for (const e of expenses) {
    // khoản chi cũ chỉ có paidBy: coi như 1 người chi hết
    const payments = e.payments?.length
      ? e.payments
      : [{ userId: e.paidBy, amount: e.amount }];

    for (const p of payments) add(String(p.userId), p.amount); // ai chi thì được ghi có
    for (const p of e.participants) add(String(p.userId), -p.share); // ai cùng chia thì phải chịu
  }
  for (const s of settlements) {
    if (s.status !== "confirmed") continue;
    add(String(s.from), s.amount); // người chuyển: nợ giảm
    add(String(s.to), -s.amount); // người nhận: khoản được nhận giảm
  }

  return net;
};

// ponytail: ghép tham lam, tối đa n-1 giao dịch (chưa chắc ít nhất tuyệt đối);
// đổi sang thuật toán tối ưu chỉ khi nhóm đông và cần giảm giao dịch hơn nữa.
export const simplifyDebts = (net) => {
  const creditors = [];
  const debtors = [];
  for (const [id, v] of Object.entries(net)) {
    if (v > 0) creditors.push({ id, v });
    else if (v < 0) debtors.push({ id, v: -v });
  }

  const order = (a, b) => b.v - a.v || a.id.localeCompare(b.id);
  creditors.sort(order);
  debtors.sort(order);

  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].v, creditors[j].v);
    transfers.push({ from: debtors[i].id, to: creditors[j].id, amount });
    debtors[i].v -= amount;
    creditors[j].v -= amount;
    if (debtors[i].v === 0) i++;
    if (creditors[j].v === 0) j++;
  }
  return transfers;
};

export const getTransfers = (expenses, settlements) =>
  simplifyDebts(computeBalances(expenses, settlements));

// Số tiền `from` đang phải chuyển cho `to` theo danh sách đã rút gọn (0 nếu không nợ).
export const getDebtBetween = (transfers, from, to) =>
  transfers.find((t) => t.from === from && t.to === to)?.amount ?? 0;