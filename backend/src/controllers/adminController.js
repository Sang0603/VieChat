// backend/src/controllers/adminController.js
import User from "../models/User.js";
import Message from "../models/Message.js";
import { getOnlineUserCount } from "../socket/index.js";

function lastNDays(n) {
  const days = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

function fmtLabel(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// GET /api/admin/stats
export const getOverviewStats = async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [totalUsers, totalMessages, todayMessages] = await Promise.all([
      User.countDocuments(),
      Message.countDocuments(),
      Message.countDocuments({ createdAt: { $gte: startOfToday } }),
    ]);
    const onlineUsers = getOnlineUserCount();

    res.json({ totalUsers, onlineUsers, totalMessages, todayMessages });
  } catch (error) {
    console.error("Lỗi getOverviewStats", error);
    res.status(500).json({ message: "Lỗi lấy thống kê tổng quan" });
  }
};

// GET /api/admin/stats/registrations?days=14
export const getRegistrationsByDay = async (req, res) => {
  try {
    const days = Math.min(Number(req.query.days) || 14, 90);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const rows = await User.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
    ]);
    const map = new Map(rows.map((r) => [r._id, r.count]));

    const result = lastNDays(days).map((d) => ({
      date: fmtLabel(d),
      value: map.get(d.toISOString().slice(0, 10)) || 0,
    }));

    res.json(result);
  } catch (error) {
    console.error("Lỗi getRegistrationsByDay", error);
    res.status(500).json({ message: "Lỗi lấy dữ liệu đăng ký" });
  }
};

// GET /api/admin/stats/messages?days=14
export const getMessagesByDay = async (req, res) => {
  try {
    const days = Math.min(Number(req.query.days) || 14, 90);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const rows = await Message.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
    ]);
    const map = new Map(rows.map((r) => [r._id, r.count]));

    const result = lastNDays(days).map((d) => ({
      date: fmtLabel(d),
      value: map.get(d.toISOString().slice(0, 10)) || 0,
    }));

    res.json(result);
  } catch (error) {
    console.error("Lỗi getMessagesByDay", error);
    res.status(500).json({ message: "Lỗi lấy dữ liệu tin nhắn" });
  }
};

// GET /api/admin/stats/online
// LƯU Ý: chỉ trả snapshot hiện tại, lấy từ onlineUsers Map real-time trong socket/index.js.
// Muốn có biểu đồ 24h thật (nhiều điểm theo giờ), cần thêm 1 collection log
// ghi lại getOnlineUserCount() mỗi giờ bằng cron job (vd node-cron), rồi trả mảng đó ra đây.
export const getOnlineSnapshot = async (req, res) => {
  try {
    res.json({ time: new Date().toISOString(), online: getOnlineUserCount() });
  } catch (error) {
    console.error("Lỗi getOnlineSnapshot", error);
    res.status(500).json({ message: "Lỗi lấy dữ liệu online" });
  }
};

// GET /api/admin/stats/activity?days=7
export const getActivityStats = async (req, res) => {
  try {
    const days = Math.min(Number(req.query.days) || 7, 30);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const [msgRows, userRows, activeRows] = await Promise.all([
      Message.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      ]),
      User.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      ]),
      Message.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            senders: { $addToSet: "$senderId" },
          },
        },
        { $project: { count: { $size: "$senders" } } },
      ]),
    ]);

    const msgMap = new Map(msgRows.map((r) => [r._id, r.count]));
    const userMap = new Map(userRows.map((r) => [r._id, r.count]));
    const activeMap = new Map(activeRows.map((r) => [r._id, r.count]));

    const result = lastNDays(days).map((d) => {
      const key = d.toISOString().slice(0, 10);
      return {
        date: fmtLabel(d),
        messages: msgMap.get(key) || 0,
        newUsers: userMap.get(key) || 0,
        activeUsers: activeMap.get(key) || 0,
      };
    });

    res.json(result);
  } catch (error) {
    console.error("Lỗi getActivityStats", error);
    res.status(500).json({ message: "Lỗi lấy dữ liệu hoạt động" });
  }
};