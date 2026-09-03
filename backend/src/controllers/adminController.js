// backend/src/controllers/adminController.js
import User from "../models/User.js";
import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";
import { getOnlineUserCount } from "../socket/index.js";

// Múi giờ dùng thống nhất cho toàn bộ thống kê theo ngày. Trước đây Mongo
// $dateToString mặc định group theo UTC, còn JS side lấy key bằng
// toISOString().slice(0,10) (cũng là UTC nhưng từ 1 local-midnight Date) —
// hai bên lệch nhau múi giờ +7, khiến dữ liệu tối hôm trước (giờ VN) bị gộp
// nhầm sang cột "hôm nay". Giờ cả hai bên đều dùng cùng 1 timezone cố định.
const TZ = "Asia/Ho_Chi_Minh";

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

// Trả về key "YYYY-MM-DD" theo local time (server chạy giờ VN), PHẢI khớp
// với key mà $dateToString bên Mongo trả về (có truyền timezone: TZ).
// Không dùng toISOString() ở đây vì nó luôn quy đổi ra UTC.
function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// so sánh % giữa 2 kỳ, tránh chia cho 0
function pctChange(curr, prev) {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}

// GET /api/admin/stats
export const getOverviewStats = async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const sevenDaysAgo = new Date(startOfToday);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const fourteenDaysAgo = new Date(startOfToday);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const [
      totalUsers,
      totalMessages,
      todayMessages,
      yesterdayMessages,
      totalRooms,
      sharedFiles,
      callAgg,
      usersLast7,
      usersPrev7,
      msgsLast7,
      msgsPrev7,
    ] = await Promise.all([
      User.countDocuments(),
      Message.countDocuments(),
      Message.countDocuments({ createdAt: { $gte: startOfToday } }),
      Message.countDocuments({ createdAt: { $gte: startOfYesterday, $lt: startOfToday } }),
      Conversation.countDocuments(),
      Message.countDocuments({ imgUrl: { $ne: null } }),
      Message.aggregate([
        { $match: { type: "call" } },
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            completedCalls: {
              $sum: { $cond: [{ $eq: ["$callInfo.status", "completed"] }, 1, 0] },
            },
            completedDurationSum: {
              $sum: {
                $cond: [
                  { $eq: ["$callInfo.status", "completed"] },
                  "$callInfo.durationInSeconds",
                  0,
                ],
              },
            },
          },
        },
      ]),
      User.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      User.countDocuments({ createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } }),
      Message.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      Message.countDocuments({ createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } }),
    ]);

    const onlineUsers = getOnlineUserCount();

    const totalCalls = callAgg[0]?.totalCalls || 0;
    const completedCalls = callAgg[0]?.completedCalls || 0;
    const avgCallDurationSec = completedCalls
      ? Math.round(callAgg[0].completedDurationSum / completedCalls)
      : 0;

    res.json({
      totalUsers,
      onlineUsers,
      totalMessages,
      todayMessages,
      totalRooms,
      sharedFiles,
      totalCalls,
      completedCalls,
      avgCallDurationSec,
      totalUsersTrendPct: pctChange(usersLast7, usersPrev7),
      totalMessagesTrendPct: pctChange(msgsLast7, msgsPrev7),
      todayMessagesTrendPct: pctChange(todayMessages, yesterdayMessages),
    });
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
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } },
          count: { $sum: 1 },
        },
      },
    ]);
    const map = new Map(rows.map((r) => [r._id, r.count]));

    const result = lastNDays(days).map((d) => ({
      date: fmtLabel(d),
      value: map.get(localDateKey(d)) || 0,
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
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } },
          count: { $sum: 1 },
        },
      },
    ]);
    const map = new Map(rows.map((r) => [r._id, r.count]));

    const result = lastNDays(days).map((d) => ({
      date: fmtLabel(d),
      value: map.get(localDateKey(d)) || 0,
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
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } },
            count: { $sum: 1 },
          },
        },
      ]),
      User.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } },
            count: { $sum: 1 },
          },
        },
      ]),
      Message.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } },
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
      const key = localDateKey(d);
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