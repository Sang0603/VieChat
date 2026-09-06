import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import { useFriendStore } from "@/stores/useFriendStore";
import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router";

const ProtectedRoute = () => {
  const { accessToken, user, loading, refresh, fetchMe } = useAuthStore();
  const [starting, setStarting] = useState(true);

  const init = async () => {
    // có thể xảy ra khi refresh trang
    if (!accessToken) {
      await refresh();
    }

    if (accessToken && !user) {
      await fetchMe();
    }

    // 🔧 FIX: trước đây không có nơi nào gọi tải conversations/friends từ
    // server khi mở app — "conversations" chỉ tồn tại nhờ cache localStorage
    // (persist) hoặc socket event mới, nên thiết bị/trình duyệt nào chưa có
    // cache (vd điện thoại lần đầu, hoặc localStorage bị xoá) sẽ thấy sidebar
    // trống trơn dù tài khoản thực sự có bạn bè/cuộc trò chuyện. Giờ luôn
    // chủ động tải mới mỗi khi vào app, không phụ thuộc cache.
    // Dùng getState() thay vì biến đầu hàm vì sau các await ở trên, giá trị
    // đã destructure có thể cũ (stale) — cần đọc lại state mới nhất.
    if (useAuthStore.getState().accessToken) {
      const { fetchConversations } = useChatStore.getState();
      const { getFriends, getAllFriendRequests } = useFriendStore.getState();

      await Promise.all([
        fetchConversations(),
        getFriends(),
        getAllFriendRequests(),
      ]);
    }

    setStarting(false);
  };

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (starting || loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        Đang tải trang...
      </div>
    );
  }

  if (!accessToken) {
    return (
      <Navigate
        to="/signin"
        replace
      />
    );
  }

  return <Outlet></Outlet>;
};

export default ProtectedRoute;