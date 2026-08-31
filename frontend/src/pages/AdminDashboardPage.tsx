import { useEffect, useRef, useState } from "react";
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
import { Users, UserCheck, MessageSquare, MessageCircle } from "lucide-react";
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

const ONLINE_POLL_MS = 30_000; // 30s / lần
const ONLINE_MAX_POINTS = 60; // giữ tối đa 60 điểm gần nhất trên chart

// Bảng màu thương hiệu VieChat: đỏ làm chủ đạo, vàng ánh kim làm điểm nhấn.
// Dùng nhất quán cho icon, viền card và chart thay vì rải màu ngẫu nhiên.
const BRAND = {
  red: "#DC2626",
  redDeep: "#991B1B",
  gold: "#D4AF37",
  slate: "#475569",
};

function StatCard({
  icon: Icon,
  label,
  value,
  accentColor,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  accentColor: string;
}) {
  return (
    <Card className="relative overflow-hidden border-border/50">
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: accentColor }}
        aria-hidden
      />
      <CardContent className="flex items-center justify-between py-5 pl-6 pr-5">
        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-semibold tracking-tight">{value}</p>
        </div>
        <div
          className="rounded-full p-3"
          style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
        >
          <Icon className="h-5 w-5" />
        </div>
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
      <span className="text-muted-foreground">
        {loading ? "Đang tải..." : "Đã cập nhật"}
      </span>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminOverviewStats | null>(null);
  const [registrations, setRegistrations] = useState<AdminDailyPoint[]>([]);
  const [messagesPerDay, setMessagesPerDay] = useState<AdminDailyPoint[]>([]);
  const [onlineHistory, setOnlineHistory] = useState<OnlinePoint[]>([]);
  const [activity, setActivity] = useState<AdminActivityPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // tải dữ liệu tổng quan + các chart lịch sử 1 lần khi mount
  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      try {
        setLoading(true);
        const [statsRes, regRes, msgRes, actRes] = await Promise.all([
          adminService.getOverviewStats(),
          adminService.getRegistrationsByDay(14),
          adminService.getMessagesByDay(14),
          adminService.getActivityStats(7),
        ]);

        if (cancelled) return;
        setStats(statsRes);
        setRegistrations(regRes);
        setMessagesPerDay(msgRes);
        setActivity(actRes);
        setError(null);
      } catch (err) {
        console.error("Lỗi tải dữ liệu admin dashboard", err);
        if (!cancelled) setError("Không tải được dữ liệu thống kê. Thử tải lại trang.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, []);

  // poll số user online định kỳ, dựng chart live client-side
  useEffect(() => {
    async function pollOnline() {
      try {
        const { online } = await adminService.getOnlineSnapshot();
        const now = new Date();
        const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

        setOnlineHistory((prev) => {
          const next = [...prev, { time, online }];
          return next.slice(-ONLINE_MAX_POINTS);
        });

        // đồng bộ luôn số online trên card tổng quan
        setStats((prev) => (prev ? { ...prev, onlineUsers: online } : prev));
      } catch (err) {
        console.error("Lỗi poll online snapshot", err);
      }
    }

    pollOnline();
    pollRef.current = setInterval(pollOnline, ONLINE_POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const fmt = (n: number) => n.toLocaleString("vi-VN");

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold text-white"
            style={{
              background: `linear-gradient(135deg, ${BRAND.red}, ${BRAND.redDeep})`,
            }}
            aria-hidden
          >
            V
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">Tổng quan hoạt động hệ thống VieChat</p>
          </div>
        </div>
        <LiveStatusPill loading={loading} />
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
        />
        <StatCard
          icon={UserCheck}
          label="Người dùng online"
          value={stats ? fmt(stats.onlineUsers) : "—"}
          accentColor={BRAND.gold}
        />
        <StatCard
          icon={MessageSquare}
          label="Tổng tin nhắn"
          value={stats ? fmt(stats.totalMessages) : "—"}
          accentColor={BRAND.redDeep}
        />
        <StatCard
          icon={MessageCircle}
          label="Tin nhắn hôm nay"
          value={stats ? fmt(stats.todayMessages) : "—"}
          accentColor={BRAND.slate}
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
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                />
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
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  name="Tin nhắn"
                  stroke={BRAND.gold}
                  strokeWidth={2}
                  fill="url(#messageFill)"
                />
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
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="online"
                    name="Online"
                    stroke={BRAND.red}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
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
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  iconType="circle"
                  iconSize={8}
                />
                <Line type="monotone" dataKey="messages" name="Tin nhắn" stroke={BRAND.gold} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="newUsers" name="Đăng ký mới" stroke={BRAND.red} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="activeUsers" name="Hoạt động" stroke={BRAND.slate} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
