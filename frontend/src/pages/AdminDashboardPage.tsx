import { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  UserCheck,
  MessageSquare,
  MessageCircle,
  Home,
  MessagesSquare,
  CalendarDays,
  Download,
  BadgeCheck,
  Paperclip,
  Eye,
  Zap,
  Phone,
  LogOut,
} from "lucide-react";
import { useNavigate } from "react-router";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSocketStore } from "@/stores/useSocketStore";
import {
  adminService,
  type AdminOverviewStats,
  type AdminDailyPoint,
  type AdminActivityPoint,
} from "@/services/adminService";

// điểm online lấy live client-side (poll định kỳ), vì backend chỉ có snapshot hiện tại
interface OnlinePoint {
  time: string; // "HH:mm"
  online: number;
}

// Số ngày mặc định hiển thị trên các chart lịch sử (đăng ký, tin nhắn) — khớp
// với tham số truyền vào adminService.getRegistrationsByDay / getMessagesByDay.
const HISTORY_DAYS = 14;

// Định dạng số giây thành "mm:ss" (dùng cho thời lượng cuộc gọi trung bình).
function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const ONLINE_POLL_MS = 30_000; // 30s / lần — số online + overview stats
const ONLINE_MAX_POINTS = 60; // giữ tối đa 60 điểm gần nhất trên chart
const CHARTS_POLL_MS = 5 * 60_000; // 5 phút / lần — chart theo ngày, ít biến động hơn

// Bảng màu thương hiệu VieChat: đỏ làm chủ đạo, vàng ánh kim làm điểm nhấn.
// Thêm 3 màu phụ (xanh lá, xanh dương, cam) để phân biệt 4 stat card đầu trang.
const BRAND = {
  red: "#DC2626",
  redDeep: "#991B1B",
  gold: "#D4AF37",
  slate: "#475569",
  green: "#16A34A",
  blue: "#2563EB",
  orange: "#F97316",
};

const NAV_ITEMS: {
  key: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
}[] = [{ key: "overview", label: "Tổng quan", icon: Home }];

function AdminSidebar() {
  const [active, setActive] = useState("overview");
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  async function handleSignOut() {
    await signOut();
    navigate("/signin");
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-border/60 bg-card">
      <div className="flex items-center gap-2 px-5 py-5">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl text-base font-bold text-white"
          style={{ background: `linear-gradient(135deg, ${BRAND.red}, ${BRAND.redDeep})` }}
          aria-hidden
        >
          V
        </div>
        <span className="text-lg font-semibold tracking-tight">VieChat</span>
        <BadgeCheck className="h-4 w-4" style={{ color: BRAND.blue }} aria-hidden />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV_ITEMS.map(({ key, label, icon: Icon, badge }) => {
          const isActive = key === active;
          return (
            <button
              key={key}
              type="button"
              // TODO: thay bằng <Link to="..."> của react-router khi các trang
              // tương ứng (Người dùng, Tin nhắn, Phòng chat...) đã được xây dựng.
              onClick={() => setActive(key)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "text-white"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
              style={isActive ? { backgroundColor: BRAND.red } : undefined}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-4 w-4" />
                {label}
              </span>
              {badge ? (
                <span
                  className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium text-white"
                  style={{ backgroundColor: isActive ? "rgba(255,255,255,0.25)" : BRAND.red }}
                >
                  {badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-border/60 px-5 py-4">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: BRAND.redDeep }}
            >
              {(user?.displayName ?? "A").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium leading-none">
                {user?.displayName ?? "Admin"}
              </p>
              <p className="text-xs text-muted-foreground">Quản trị viên</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            title="Đăng xuất"
            aria-label="Đăng xuất"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

// Mini sparkline vẽ bằng SVG thuần (không dùng recharts) để nhẹ và dễ nhúng
// gọn bên trong từng stat card.
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const width = 72;
  const height = 32;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrendBadge({ pct, label = "so với 7 ngày trước" }: { pct?: number; label?: string }) {
  if (pct === undefined) return null;
  const positive = pct >= 0;
  return (
    <span className={`text-xs font-medium ${positive ? "text-emerald-600" : "text-red-500"}`}>
      {positive ? "↑" : "↓"} {Math.abs(pct)}% {label}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accentColor,
  trendPct,
  trendLabel,
  sparkData,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  accentColor: string;
  trendPct?: number;
  trendLabel?: string;
  sparkData?: number[];
}) {
  return (
    <Card className="border-border/50">
      <CardContent className="flex items-start justify-between gap-3 py-5 pl-5 pr-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
            >
              <Icon className="h-4 w-4" />
            </div>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
          <p className="text-3xl font-semibold tracking-tight">{value}</p>
          <TrendBadge pct={trendPct} label={trendLabel} />
        </div>
        {sparkData && sparkData.length > 1 ? (
          <Sparkline data={sparkData} color={accentColor} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function LiveStatusPill({ loading }: { loading: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1.5 text-sm">
      <span className="relative flex h-2 w-2">
        {!loading && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
            style={{ backgroundColor: BRAND.red }}
          />
        )}
        <span
          className="relative inline-flex h-2 w-2 rounded-full"
          style={{ backgroundColor: loading ? BRAND.slate : BRAND.red }}
        />
      </span>
      <span className="text-muted-foreground">{loading ? "Đang tải..." : "Đã cập nhật"}</span>
    </div>
  );
}

function SummaryStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full"
        style={{ backgroundColor: `${BRAND.gold}1A`, color: BRAND.redDeep }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-base font-semibold leading-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// LƯU Ý: registrations[].date đến từ backend (getRegistrationsByDay) đã được
// format sẵn dạng "DD/MM" bởi fmtLabel() phía server — KHÔNG phải chuỗi ISO.
// Trước đây hàm này nhận mảng registrations và cố `new Date(days[i].date)`,
// tức là parse lại chuỗi "DD/MM" như thể nó là ISO. new Date("19/08") không
// hợp lệ nên JS engine đoán mò, sinh Invalid Date / gán năm mặc định sai
// (ví dụ 2001) — đó là nguyên nhân label bị vỡ thành "19/08 - 09/01/2001".
//
// Sửa: không parse lại chuỗi đã format sẵn. Tự tính khoảng ngày từ số ngày
// yêu cầu (numDays) dựa trên ngày thật hiện tại, độc lập với dữ liệu trả về.
function formatDateRangeLabel(numDays: number): string {
  const toDisplay = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (numDays - 1));

  return `${toDisplay(start)} - ${toDisplay(end)}`;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminOverviewStats | null>(null);
  const [registrations, setRegistrations] = useState<AdminDailyPoint[]>([]);
  const [messagesPerDay, setMessagesPerDay] = useState<AdminDailyPoint[]>([]);
  const [onlineHistory, setOnlineHistory] = useState<OnlinePoint[]>([]);
  const [activity, setActivity] = useState<AdminActivityPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const onlinePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chartsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // tải các chart lịch sử (đăng ký / tin nhắn / hoạt động theo ngày) — gọi lúc
  // mount, rồi lặp lại mỗi CHARTS_POLL_MS vì các số này ít biến động theo giây.
  useEffect(() => {
    let cancelled = false;

    async function loadCharts(isFirstLoad: boolean) {
      try {
        if (isFirstLoad) setLoading(true);
        const [regRes, msgRes, actRes] = await Promise.all([
          adminService.getRegistrationsByDay(HISTORY_DAYS),
          adminService.getMessagesByDay(HISTORY_DAYS),
          adminService.getActivityStats(7),
        ]);

        if (cancelled) return;
        setRegistrations(regRes);
        setMessagesPerDay(msgRes);
        setActivity(actRes);
        setError(null);
      } catch (err) {
        console.error("Lỗi tải dữ liệu chart admin dashboard", err);
        if (!cancelled && isFirstLoad) {
          setError("Không tải được dữ liệu thống kê. Thử tải lại trang.");
        }
      } finally {
        if (!cancelled && isFirstLoad) setLoading(false);
      }
    }

    loadCharts(true);
    chartsPollRef.current = setInterval(() => loadCharts(false), CHARTS_POLL_MS);
    return () => {
      cancelled = true;
      if (chartsPollRef.current) clearInterval(chartsPollRef.current);
    };
  }, []);

  // realtime: nhận số online tức thì qua socket (room "admins", xem
  // backend/src/socket/index.js) thay vì đợi vòng poll 30s bên dưới.
  // Vẫn giữ pollLive() làm fallback + nguồn cho overview stats khác.
  const socket = useSocketStore((s) => s.socket);
  useEffect(() => {
    if (!socket) return;

    function handleOnlineCount(online: number) {
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      setOnlineHistory((prev) => {
        const next = [...prev, { time, online }];
        return next.slice(-ONLINE_MAX_POINTS);
      });
      setStats((prev) => (prev ? { ...prev, onlineUsers: online } : prev));
    }

    socket.on("online-count", handleOnlineCount);
    return () => {
      socket.off("online-count", handleOnlineCount);
    };
  }, [socket]);

  // poll số user online + overview stats định kỳ, dựng chart online live client-side.
  // Gộp chung 1 interval vì cả 2 đều "nóng" (thay đổi theo thời gian thực).
  useEffect(() => {
    async function pollLive() {
      try {
        const [{ online }, statsRes] = await Promise.all([
          adminService.getOnlineSnapshot(),
          adminService.getOverviewStats(),
        ]);
        const now = new Date();
        const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

        setOnlineHistory((prev) => {
          const next = [...prev, { time, online }];
          return next.slice(-ONLINE_MAX_POINTS);
        });

        // overview stats đã có onlineUsers riêng, nhưng ghi đè bằng snapshot vừa
        // lấy để đảm bảo khớp với điểm mới nhất trên chart online.
        setStats({ ...statsRes, onlineUsers: online });
      } catch (err) {
        console.error("Lỗi poll dữ liệu live admin dashboard", err);
      }
    }

    pollLive();
    onlinePollRef.current = setInterval(pollLive, ONLINE_POLL_MS);
    return () => {
      if (onlinePollRef.current) clearInterval(onlinePollRef.current);
    };
  }, []);

  const fmt = (n: number) => n.toLocaleString("vi-VN");
  const dateRangeLabel = useMemo(() => formatDateRangeLabel(HISTORY_DAYS), []);

  function handleExportReport() {
    if (!stats) return;
    const rows = [
      ["Chỉ số", "Giá trị"],
      ["Tổng người dùng", String(stats.totalUsers)],
      ["Người dùng online", String(stats.onlineUsers)],
      ["Tổng tin nhắn", String(stats.totalMessages)],
      ["Tin nhắn hôm nay", String(stats.todayMessages)],
      ["Tổng số phòng chat", String(stats.totalRooms)],
      ["Ảnh / file đã chia sẻ", String(stats.sharedFiles)],
      ["Cuộc gọi đã thực hiện", String(stats.totalCalls)],
      ["Cuộc gọi thành công", String(stats.completedCalls)],
      ["Thời lượng gọi trung bình (giây)", String(stats.avgCallDurationSec)],
      ["Khoảng thời gian", dateRangeLabel],
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `viechat-bao-cao-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AdminSidebar />

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">Tổng quan hoạt động hệ thống VieChat</p>
          </div>
          <div className="flex items-center gap-3">
            <LiveStatusPill loading={loading} />
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 text-sm text-foreground hover:bg-muted/60"
            >
              <CalendarDays className="h-4 w-4" />
              {dateRangeLabel}
            </button>
            <button
              type="button"
              onClick={handleExportReport}
              disabled={!stats}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: BRAND.red }}
            >
              <Download className="h-4 w-4" />
              Xuất báo cáo
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Users}
            label="Tổng người dùng"
            value={stats ? fmt(stats.totalUsers) : "—"}
            accentColor={BRAND.red}
            trendPct={stats?.totalUsersTrendPct}
            sparkData={registrations.map((r) => r.value)}
          />
          <StatCard
            icon={UserCheck}
            label="Người dùng online"
            value={stats ? fmt(stats.onlineUsers) : "—"}
            accentColor={BRAND.green}
            sparkData={onlineHistory.map((p) => p.online)}
          />
          <StatCard
            icon={MessageSquare}
            label="Tổng tin nhắn"
            value={stats ? fmt(stats.totalMessages) : "—"}
            accentColor={BRAND.blue}
            trendPct={stats?.totalMessagesTrendPct}
            sparkData={messagesPerDay.map((m) => m.value)}
          />
          <StatCard
            icon={MessageCircle}
            label="Tin nhắn hôm nay"
            value={stats ? fmt(stats.todayMessages) : "—"}
            accentColor={BRAND.orange}
            trendPct={stats?.todayMessagesTrendPct}
            trendLabel="so với hôm qua"
            sparkData={activity.map((a) => a.messages)}
          />
        </div>

        {/* Charts row 1 */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Người dùng đăng ký theo ngày</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={registrations}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                  <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} width={28} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="value" name="Người đăng ký" fill={BRAND.red} radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Tin nhắn theo ngày</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={messagesPerDay}>
                  <defs>
                    <linearGradient id="messageFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BRAND.gold} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={BRAND.gold} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                  <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} width={28} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                  <Area type="monotone" dataKey="value" name="Tin nhắn" stroke={BRAND.gold} strokeWidth={2} fill="url(#messageFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Charts row 2 */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Người dùng online (trực tiếp)</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              {onlineHistory.length < 2 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Đang thu thập dữ liệu online, chờ khoảng {ONLINE_POLL_MS / 1000}s...
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={onlineHistory}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                    <XAxis dataKey="time" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} width={28} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                    <Line type="monotone" dataKey="online" name="Online" stroke={BRAND.red} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Thống kê hoạt động (7 ngày)</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={activity}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                  <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} width={28} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                  <Line type="monotone" dataKey="messages" name="Tin nhắn" stroke={BRAND.gold} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="newUsers" name="Đăng ký mới" stroke={BRAND.red} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="activeUsers" name="Hoạt động" stroke={BRAND.slate} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Summary strip cuối trang — toàn bộ số liệu thật, lấy từ Conversation/Message */}
        <Card className="border-border/50">
          <CardContent className="flex flex-wrap items-center justify-between gap-6 py-5">
            <SummaryStat icon={MessagesSquare} label="Tổng số phòng chat" value={stats ? fmt(stats.totalRooms) : "—"} />
            <SummaryStat icon={Paperclip} label="Ảnh / file đã chia sẻ" value={stats ? fmt(stats.sharedFiles) : "—"} />
            <SummaryStat
              icon={Phone}
              label="Cuộc gọi đã thực hiện"
              value={stats ? `${fmt(stats.totalCalls)} (${fmt(stats.completedCalls)} thành công)` : "—"}
            />
            <SummaryStat
              icon={Zap}
              label="Tỷ lệ cuộc gọi thành công"
              value={stats && stats.totalCalls > 0 ? `${Math.round((stats.completedCalls / stats.totalCalls) * 100)}%` : "—"}
            />
            <SummaryStat
              icon={Eye}
              label="Thời lượng gọi trung bình"
              value={stats && stats.completedCalls > 0 ? formatDuration(stats.avgCallDurationSec) : "—"}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
