// Chạy: node --test src/utils/splitMoney.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  splitEqually,
  validatePayments,
  validateShares,
  computeBalances,
  getTransfers,
  getDebtBetween,
} from "./splitMoney.js";

const members = ["sang", "minh", "lan"];
const expenses = [
  { paidBy: "sang", amount: 450000, participants: splitEqually(450000, members) },
  { paidBy: "minh", amount: 90000, participants: splitEqually(90000, members) },
  { paidBy: "lan", amount: 120000, participants: splitEqually(120000, members) },
];

test("chia đều có số dư lẻ: tổng luôn đúng", () => {
  const shares = splitEqually(100000, members).map((p) => p.share);
  assert.deepEqual(shares, [33334, 33333, 33333]);
  assert.equal(shares.reduce((a, b) => a + b, 0), 100000);
});

test("số dư của ví dụ Sáng, Minh, Lan", () => {
  assert.deepEqual(computeBalances(expenses), {
    sang: 230000,
    minh: -130000,
    lan: -100000,
  });
});

test("rút gọn nợ cho ra đúng hai giao dịch", () => {
  assert.deepEqual(getTransfers(expenses, []), [
    { from: "minh", to: "sang", amount: 130000 },
    { from: "lan", to: "sang", amount: 100000 },
  ]);
});

test("chỉ khoản trả nợ đã xác nhận mới làm giảm nợ", () => {
  const pending = [{ from: "minh", to: "sang", amount: 130000, status: "pending" }];
  const rejected = [{ from: "minh", to: "sang", amount: 130000, status: "rejected" }];
  const confirmed = [{ from: "minh", to: "sang", amount: 130000, status: "confirmed" }];

  assert.equal(getDebtBetween(getTransfers(expenses, pending), "minh", "sang"), 130000);
  assert.equal(getDebtBetween(getTransfers(expenses, rejected), "minh", "sang"), 130000);
  assert.equal(getDebtBetween(getTransfers(expenses, confirmed), "minh", "sang"), 0);
  assert.deepEqual(getTransfers(expenses, confirmed), [
    { from: "lan", to: "sang", amount: 100000 },
  ]);
});

test("không ai nợ ai thì không có giao dịch", () => {
  assert.deepEqual(getTransfers([], []), []);
  const alone = [{ paidBy: "sang", amount: 50000, participants: [{ userId: "sang", share: 50000 }] }];
  assert.deepEqual(getTransfers(alone, []), []);
});

test("kiểm tra dữ liệu khoản chi", () => {
  const ok = [{ userId: "a", share: 60 }, { userId: "b", share: 40 }];
  assert.equal(validateShares(100, ok), null);
  assert.match(validateShares(0, ok), /số nguyên/);
  assert.match(validateShares(1.5, ok), /số nguyên/);
  assert.match(validateShares(2_000_000_000, ok), /số nguyên/);
  assert.match(validateShares(100, []), /ít nhất/);
  assert.match(validateShares(100, [{ userId: "a", share: 50 }, { userId: "b", share: 40 }]), /Tổng/);
  assert.match(validateShares(100, [{ userId: "a", share: 50 }, { userId: "a", share: 50 }]), /hai lần/);
  assert.match(validateShares(100, [{ userId: "a", share: -1 }, { userId: "b", share: 101 }]), /lớn hơn 0/);
});

test("nhiều người cùng chi (chuyến Hạ Long): chia đều rồi mới ra ai trả ai", () => {
  const trip = [
    {
      amount: 11616660,
      payments: [
        { userId: "sang", amount: 6666660 },
        { userId: "minh", amount: 550000 },
        { userId: "lan", amount: 4400000 },
      ],
      participants: splitEqually(11616660, members), // mỗi người chịu 3.872.220đ
    },
  ];
  assert.deepEqual(computeBalances(trip), {
    sang: 2794440,
    minh: -3322220,
    lan: 527780,
  });
  assert.deepEqual(getTransfers(trip, []), [
    { from: "minh", to: "sang", amount: 2794440 },
    { from: "minh", to: "lan", amount: 527780 },
  ]);
});

test("người chi tiền nhưng không cùng chia vẫn được nhận lại đủ", () => {
  const covered = [
    {
      amount: 300000,
      payments: [{ userId: "sang", amount: 300000 }],
      participants: splitEqually(300000, ["minh", "lan"]),
    },
  ];
  assert.deepEqual(computeBalances(covered), { sang: 300000, minh: -150000, lan: -150000 });
});

test("khoản chi kiểu cũ (chỉ có paidBy) vẫn tính đúng", () => {
  assert.deepEqual(computeBalances([expenses[0]]), {
    sang: 300000,
    minh: -150000,
    lan: -150000,
  });
});

test("kiểm tra danh sách người chi tiền", () => {
  assert.equal(validatePayments([{ userId: "a", amount: 10 }, { userId: "b", amount: 5 }]), null);
  assert.match(validatePayments([]), /ít nhất/);
  assert.match(validatePayments(undefined), /ít nhất/);
  assert.match(validatePayments([{ userId: "a", amount: 0 }]), /lớn hơn 0/);
  assert.match(validatePayments([{ userId: "a", amount: 1.5 }]), /số nguyên/);
  assert.match(validatePayments([{ userId: "a", amount: 5 }, { userId: "a", amount: 5 }]), /hai lần/);
  assert.match(validatePayments([{ userId: "", amount: 5 }]), /không hợp lệ/);
  assert.match(
    validatePayments([{ userId: "a", amount: 600_000_000 }, { userId: "b", amount: 600_000_000 }]),
    /1\.000\.000\.000/
  );
});