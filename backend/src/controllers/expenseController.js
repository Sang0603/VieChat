import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Expense, { EXPENSE_CATEGORIES } from "../models/Expense.js";
import Message from "../models/Message.js";
import Settlement from "../models/Settlement.js";
import User from "../models/User.js";
import { io } from "../socket/index.js";
import {
  emitNewMessage,
  updateConversationAfterCreateMessage,
} from "../utils/messageHelper.js";
import {
  computeBalances,
  getDebtBetween,
  simplifyDebts,
  validatePayments,
  validateShares,
} from "../utils/splitMoney.js";

const MAX_TITLE_LENGTH = 100;
const MAX_PURPOSE_LENGTH = 50;
const MAX_EXPENSES_PER_CONVERSATION = 1000;

// Lấy nhóm chat và kiểm tra người gọi là thành viên.
// Nếu không hợp lệ thì đã trả lỗi cho client và hàm trả về null.
// Không phải thành viên và không tồn tại dùng chung 1 thông báo (404)
// để người ngoài không dò được nhóm nào có thật.
const loadGroup = async (req, res) => {
  const { conversationId } = req.params;

  if (!mongoose.isValidObjectId(conversationId)) {
    res.status(400).json({ message: "Mã cuộc trò chuyện không hợp lệ" });
    return null;
  }

  const conversation = await Conversation.findById(conversationId).select(
    "type participants"
  );
  const myId = String(req.user._id);
  const memberIds = new Set((conversation?.participants ?? []).map((p) => String(p.userId)));

  if (!conversation || !memberIds.has(myId)) {
    res.status(404).json({ message: "Không tìm thấy nhóm" });
    return null;
  }

  if (conversation.type !== "group") {
    res.status(400).json({ message: "Chỉ nhóm chat mới có chi tiêu chung" });
    return null;
  }

  return { myId, memberIds };
};

// báo cho cả nhóm biết để tải lại số dư (room socket = id cuộc trò chuyện)
const notify = (conversationId) => {
  io.to(String(conversationId)).emit("expense-updated", {
    conversationId: String(conversationId),
  });
};

// 🆕 MỚI THÊM: đăng 1 tin nhắn thông báo khoản chi vào đoạn chat nhóm và phát
// realtime cho cả nhóm. Khoản chi đã lưu xong rồi nên nếu bước này lỗi thì chỉ
// ghi log, KHÔNG làm hỏng việc tạo khoản chi.
const postExpenseMessage = async (req, expense) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) return;

    const senderName = req.user.displayName ?? "Một thành viên";
    const amountText = `${expense.amount.toLocaleString("vi-VN")}đ`;

    const message = await Message.create({
      conversationId: conversation._id,
      senderId: req.user._id,
      type: "expense",
      // câu tóm tắt: dùng cho xem trước tin cuối ở sidebar và làm nội dung dự phòng
      content: `${senderName} đã thêm khoản chi ${expense.title}: ${amountText}`,
      expenseInfo: {
        expenseId: expense._id,
        title: expense.title,
        amount: expense.amount,
        participantCount: expense.participants.length,
      },
    });

    updateConversationAfterCreateMessage(conversation, message, req.user._id);
    await conversation.save();

    emitNewMessage(io, conversation, message.toObject());
  } catch (error) {
    console.error("Lỗi xảy ra khi đăng thông báo khoản chi vào chat", error);
  }
};

// 🆕 MỚI THÊM: xóa tin nhắn thẻ của khoản chi vừa bị xóa khỏi đoạn chat nhóm, rồi báo
// realtime cho cả nhóm để thẻ biến mất ngay. Khoản chi đã xóa xong rồi nên nếu bước này
// lỗi thì chỉ ghi log, KHÔNG làm hỏng việc xóa khoản chi.
const removeExpenseMessages = async (conversationId, expenseId) => {
  try {
    const messages = await Message.find({
      conversationId,
      type: "expense",
      "expenseInfo.expenseId": expenseId,
    })
      .select("_id")
      .lean();

    if (messages.length === 0) return;

    const removedIds = messages.map((m) => m._id);
    const removedIdStrings = removedIds.map(String);

    await Message.deleteMany({ _id: { $in: removedIds } });

    const payload = {
      conversationId: String(conversationId),
      messageIds: removedIdStrings,
    };

    // nếu thẻ vừa xóa đang là tin cuối của cuộc trò chuyện thì chuyển tin cuối
    // về tin mới nhất còn lại (để sidebar không còn hiện câu "đã thêm khoản chi")
    const conversation = await Conversation.findById(conversationId);
    const lastId = conversation?.lastMessage?._id;

    if (conversation && lastId && removedIdStrings.includes(String(lastId))) {
      const newest = await Message.findOne({ conversationId })
        .sort({ createdAt: -1 })
        .lean();

      if (newest) {
        conversation.lastMessage = {
          _id: newest._id,
          content: newest.content ?? "",
          senderId: newest.senderId,
          createdAt: newest.createdAt,
        };
        conversation.lastMessageAt = newest.createdAt;
        payload.lastMessage = {
          _id: String(newest._id),
          content: newest.content ?? "",
          senderId: String(newest.senderId),
          createdAt: newest.createdAt,
        };
        payload.lastMessageAt = newest.createdAt;
      } else {
        // không còn tin nhắn nào trong nhóm
        conversation.set("lastMessage", undefined);
        payload.lastMessage = null;
      }

      await conversation.save();
    }

    io.to(String(conversationId)).emit("messages-removed", payload);
  } catch (error) {
    console.error("Lỗi xảy ra khi xóa thông báo khoản chi khỏi chat", error);
  }
};

// Toàn bộ khoản chi + khoản trả nợ của nhóm, và nợ tính ra từ đó.
// Nợ được tính RIÊNG cho từng khoản chi: mỗi khoản có danh sách "ai chuyển cho ai" của riêng nó,
// và chỉ các khoản trả nợ gắn với khoản chi đó mới làm giảm nợ của khoản đó.
// Số dư không lưu sẵn nên không bao giờ lệch dữ liệu.
const loadLedger = async (conversationId) => {
  const [expenses, settlements] = await Promise.all([
    Expense.find({ conversationId }).sort({ createdAt: -1 }).lean(),
    Settlement.find({
      conversationId,
      status: { $in: ["pending", "confirmed"] },
    }).lean(),
  ]);

  // gom khoản trả nợ theo khoản chi (bản ghi cũ không có expenseId thì bỏ qua)
  const settlementsByExpense = new Map();
  for (const s of settlements) {
    if (!s.expenseId) continue;
    const key = String(s.expenseId);
    if (!settlementsByExpense.has(key)) settlementsByExpense.set(key, []);
    settlementsByExpense.get(key).push(s);
  }

  const groups = expenses.map((expense) => {
    const expenseId = String(expense._id);
    const net = computeBalances([expense], settlementsByExpense.get(expenseId) ?? []);
    const transfers = simplifyDebts(net).map((t) => ({ ...t, expenseId }));
    return { expenseId, net, transfers };
  });

  // số dư tổng của từng người (cộng dồn các khoản chi) và toàn bộ giao dịch cần làm
  const net = {};
  for (const g of groups) {
    for (const [userId, value] of Object.entries(g.net)) {
      net[userId] = (net[userId] ?? 0) + value;
    }
  }
  const transfers = groups.flatMap((g) => g.transfers);

  return { expenses, settlements, groups, net, transfers };
};

export const getExpenses = async (req, res) => {
  try {
    const group = await loadGroup(req, res);
    if (!group) return;

    const expenses = await Expense.find({ conversationId: req.params.conversationId })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ expenses });
  } catch (error) {
    console.error("Lỗi xảy ra khi getExpenses", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const createExpense = async (req, res) => {
  try {
    const group = await loadGroup(req, res);
    if (!group) return;
    const { myId, memberIds } = group;

    // `category` chung không bắt buộc: chỉ dùng cho người chi nào không gửi loại chi riêng
    // (client cũ). Nếu có thì phải hợp lệ.
    const { title, splitType, participants, category = "other" } = req.body;

    const cleanTitle = typeof title === "string" ? title.trim() : "";
    if (!cleanTitle || cleanTitle.length > MAX_TITLE_LENGTH) {
      return res
        .status(400)
        .json({ message: `Tên khoản chi phải từ 1 đến ${MAX_TITLE_LENGTH} ký tự` });
    }

    if (!EXPENSE_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: "Loại chi tiêu không hợp lệ" });
    }

    if (splitType !== "equal" && splitType !== "custom") {
      return res.status(400).json({ message: "Cách chia không hợp lệ" });
    }

    // Ai đã chi bao nhiêu: nhận danh sách payments [{ userId, amount, category, purpose }]
    // (nhiều người cùng chi). Vẫn nhận kiểu cũ { paidBy, amount } (1 người chi hết) để bản
    // giao diện cũ không hỏng.
    const { payments: bodyPayments, paidBy, amount: bodyAmount } = req.body;
    const payments = Array.isArray(bodyPayments)
      ? bodyPayments
      : paidBy !== undefined
        ? [{ userId: paidBy, amount: bodyAmount }]
        : undefined;

    const paymentError = validatePayments(payments);
    if (paymentError) return res.status(400).json({ message: paymentError });

    if (payments.some((p) => !memberIds.has(p.userId))) {
      return res.status(400).json({ message: "Người chi tiền phải là thành viên nhóm" });
    }

    // loại chi của từng người: không gửi thì dùng loại chung ở trên
    const categoryOf = (p) => p.category ?? category;
    if (payments.some((p) => !EXPENSE_CATEGORIES.includes(categoryOf(p)))) {
      return res.status(400).json({ message: "Loại chi tiêu không hợp lệ" });
    }

    // nội dung chi do người dùng gõ: chỉ nhận chuỗi, bỏ khoảng trắng thừa, tối đa 50 ký tự
    const purposeOf = (p) => (typeof p.purpose === "string" ? p.purpose.trim() : "");
    if (payments.some((p) => purposeOf(p).length > MAX_PURPOSE_LENGTH)) {
      return res
        .status(400)
        .json({ message: `Nội dung chi tối đa ${MAX_PURPOSE_LENGTH} ký tự` });
    }

    // tổng số tiền luôn tính từ số tiền mỗi người đã chi (không tin `amount` client gửi)
    const amount = payments.reduce((total, p) => total + p.amount, 0);

    // loại chi chính của cả khoản = loại của người chi nhiều nhất (dùng cho biểu tượng)
    const biggest = payments.reduce((a, b) => (b.amount > a.amount ? b : a));

    // kiểm tra tổng phần chia khớp tổng tiền, không trùng người (không tin frontend)
    const shareError = validateShares(amount, participants);
    if (shareError) return res.status(400).json({ message: shareError });

    if (participants.some((p) => !memberIds.has(p.userId))) {
      return res
        .status(400)
        .json({ message: "Chỉ thành viên nhóm mới được tham gia chia tiền" });
    }

    const count = await Expense.countDocuments({
      conversationId: req.params.conversationId,
    });
    if (count >= MAX_EXPENSES_PER_CONVERSATION) {
      return res.status(400).json({ message: "Nhóm đã đạt số khoản chi tối đa" });
    }

    const expense = await Expense.create({
      conversationId: req.params.conversationId,
      title: cleanTitle,
      category: categoryOf(biggest),
      amount,
      payments: payments.map((p) => ({
        userId: p.userId,
        amount: p.amount,
        category: categoryOf(p),
        purpose: purposeOf(p),
      })),
      splitType,
      participants: participants.map((p) => ({ userId: p.userId, share: p.share })),
      createdBy: myId,
    });

    // 🆕 đăng thông báo vào đoạn chat nhóm (realtime cho cả nhóm)
    await postExpenseMessage(req, expense);

    notify(req.params.conversationId);
    return res.status(201).json({ expense });
  } catch (error) {
    console.error("Lỗi xảy ra khi createExpense", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const deleteExpense = async (req, res) => {
  try {
    const group = await loadGroup(req, res);
    if (!group) return;

    const { expenseId } = req.params;
    if (!mongoose.isValidObjectId(expenseId)) {
      return res.status(400).json({ message: "Mã khoản chi không hợp lệ" });
    }

    const expense = await Expense.findOne({
      _id: expenseId,
      conversationId: req.params.conversationId,
    }).lean();

    if (!expense) {
      return res.status(404).json({ message: "Không tìm thấy khoản chi" });
    }

    if (String(expense.createdBy) !== group.myId) {
      return res.status(403).json({ message: "Chỉ người tạo mới được xóa khoản chi" });
    }

    await Expense.deleteOne({ _id: expense._id });
    // khoản chi đã xóa thì các khoản trả nợ của nó cũng không còn ý nghĩa
    await Settlement.deleteMany({
      conversationId: req.params.conversationId,
      expenseId: expense._id,
    });

    // 🆕 xóa luôn thẻ thông báo của khoản chi này khỏi đoạn chat (realtime cho cả nhóm)
    await removeExpenseMessages(req.params.conversationId, expense._id);

    notify(req.params.conversationId);
    return res.status(200).json({ message: "Đã xóa khoản chi" });
  } catch (error) {
    console.error("Lỗi xảy ra khi deleteExpense", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getBalances = async (req, res) => {
  try {
    const group = await loadGroup(req, res);
    if (!group) return;

    const { settlements, net, transfers } = await loadLedger(req.params.conversationId);

    return res.status(200).json({
      balances: Object.entries(net).map(([userId, value]) => ({ userId, net: value })),
      // mỗi giao dịch có expenseId: nợ của khoản chi nào
      transfers,
      pendingSettlements: settlements.filter((s) => s.status === "pending" && s.expenseId),
    });
  } catch (error) {
    console.error("Lỗi xảy ra khi getBalances", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// "Tôi đã chuyển" (trả nợ cho 1 khoản chi cụ thể)
export const createSettlement = async (req, res) => {
  try {
    const group = await loadGroup(req, res);
    if (!group) return;
    const { myId, memberIds } = group;

    const { to, amount, expenseId } = req.body;

    if (typeof to !== "string" || !memberIds.has(to) || to === myId) {
      return res.status(400).json({ message: "Người nhận không hợp lệ" });
    }

    if (typeof expenseId !== "string" || !mongoose.isValidObjectId(expenseId)) {
      return res.status(400).json({ message: "Cần chọn khoản chi cần trả nợ" });
    }

    if (!Number.isInteger(amount) || amount < 1) {
      return res.status(400).json({ message: "Số tiền không hợp lệ" });
    }

    // chỉ được báo chuyển tối đa bằng số đang nợ người đó TRONG KHOẢN CHI NÀY
    const { groups } = await loadLedger(req.params.conversationId);
    const expenseLedger = groups.find((g) => g.expenseId === expenseId);
    if (!expenseLedger) {
      return res.status(404).json({ message: "Không tìm thấy khoản chi" });
    }

    const debt = getDebtBetween(expenseLedger.transfers, myId, to);

    if (debt < 1) {
      return res.status(400).json({ message: "Bạn không nợ người này trong khoản chi này" });
    }
    if (amount > debt) {
      return res.status(400).json({ message: "Số tiền vượt quá khoản đang nợ" });
    }

    const alreadyPending = await Settlement.exists({
      conversationId: req.params.conversationId,
      expenseId,
      from: myId,
      to,
      status: "pending",
    });
    if (alreadyPending) {
      return res
        .status(409)
        .json({ message: "Bạn đã báo chuyển cho người này, đang chờ xác nhận" });
    }

    let settlement;
    try {
      settlement = await Settlement.create({
        conversationId: req.params.conversationId,
        expenseId,
        from: myId,
        to,
        amount,
      });
    } catch (error) {
      // bấm 2 lần cùng lúc: chỉ mục duy nhất của database chặn bản ghi thứ hai
      if (error?.code === 11000) {
        return res
          .status(409)
          .json({ message: "Bạn đã báo chuyển cho người này, đang chờ xác nhận" });
      }
      throw error;
    }

    notify(req.params.conversationId);
    return res.status(201).json({ settlement });
  } catch (error) {
    console.error("Lỗi xảy ra khi createSettlement", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// "Đã nhận" (confirmed) hoặc "Chưa nhận được" (rejected); chỉ người nhận được làm,
// và chỉ khi khoản đó còn đang chờ xác nhận.
const resolveSettlement = async (req, res, status) => {
  try {
    const group = await loadGroup(req, res);
    if (!group) return;

    const { settlementId } = req.params;
    if (!mongoose.isValidObjectId(settlementId)) {
      return res.status(400).json({ message: "Mã khoản trả nợ không hợp lệ" });
    }

    const settlement = await Settlement.findOneAndUpdate(
      {
        _id: settlementId,
        conversationId: req.params.conversationId,
        to: group.myId,
        status: "pending",
      },
      { $set: status === "confirmed" ? { status, confirmedAt: new Date() } : { status } },
      { new: true }
    ).lean();

    if (!settlement) {
      return res.status(404).json({ message: "Không tìm thấy khoản đang chờ xác nhận" });
    }

    notify(req.params.conversationId);
    return res.status(200).json({ settlement });
  } catch (error) {
    console.error("Lỗi xảy ra khi resolveSettlement", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const confirmSettlement = (req, res) => resolveSettlement(req, res, "confirmed");
export const rejectSettlement = (req, res) => resolveSettlement(req, res, "rejected");

// Tài khoản nhận tiền của người đang được MÌNH nợ. Chỉ trả khi mình thật sự còn
// nợ người đó (ở ít nhất một khoản chi) trong nhóm này; người khác, bạn bè,
// người ngoài nhóm đều không xem được.
export const getPaymentInfo = async (req, res) => {
  try {
    const group = await loadGroup(req, res);
    if (!group) return;
    const { myId, memberIds } = group;

    const { userId } = req.params;
    if (!memberIds.has(userId) || userId === myId) {
      return res.status(400).json({ message: "Người nhận không hợp lệ" });
    }

    const { transfers } = await loadLedger(req.params.conversationId);
    if (getDebtBetween(transfers, myId, userId) < 1) {
      return res
        .status(403)
        .json({ message: "Bạn không nợ người này nên không xem được tài khoản nhận tiền" });
    }

    const target = await User.findById(userId).select("+bankInfo");
    const info = target?.bankInfo;

    return res.status(200).json({
      bankInfo: info?.bankId
        ? {
            bankId: info.bankId,
            accountNo: info.accountNo ?? "",
            accountName: info.accountName ?? "",
          }
        : null,
    });
  } catch (error) {
    console.error("Lỗi xảy ra khi getPaymentInfo", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};